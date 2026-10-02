import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from '../../../domain/exceptions/domain.exception.js';
import {
  OrderStatus,
  assertOrderTransition,
} from '../../../domain/orders/order-status.js';
import {
  PaymentStatus,
  assertPaymentTransition,
} from '../../../domain/payments/payment-status.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
  type Order,
  type OrderItem,
  type Refund,
  type Shipment,
} from '../../../domain/repositories/commerce.repository.js';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../../domain/repositories/inventory.repository.js';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../domain/repositories/unit-of-work.js';
import { CustomerNotifier } from '../notifications/customer-notifier.js';

const SHIPPABLE: readonly string[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
  OrderStatus.PARTIALLY_SHIPPED,
];

const REFUNDABLE_PAYMENT: readonly string[] = [
  PaymentStatus.VERIFIED,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUND_PENDING,
];

const outstanding = (item: OrderItem) =>
  item.quantity - item.quantityShipped - item.quantityCancelled;

type LineRequest = { orderItemId: string; quantity: number };

/** Merges duplicate lines and checks they belong to the order. */
function normaliseLines(
  lines: LineRequest[],
  items: OrderItem[],
): Array<{ item: OrderItem; quantity: number }> {
  const merged = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new ValidationException('Quantities must be whole numbers above 0');
    }
    merged.set(
      line.orderItemId,
      (merged.get(line.orderItemId) ?? 0) + line.quantity,
    );
  }
  return [...merged.entries()].map(([orderItemId, quantity]) => {
    const item = items.find((i) => i.id === orderItemId);
    if (!item) {
      throw new ValidationException(
        'An item is not part of this order',
        'ORDER_ITEM_INVALID',
        { orderItemId },
      );
    }
    return { item, quantity };
  });
}

/**
 * Moves the order to the fulfilment status implied by its item counters:
 * SHIPPED when nothing is left to send, PARTIALLY_SHIPPED when some units
 * went out, CANCELLED when every unit was cancelled before shipping.
 */
async function syncFulfilmentStatus(
  commerce: CommerceRepository,
  order: Order,
  actor: { adminId: string; note: string },
): Promise<Order> {
  const items = await commerce.listOrderItems(order.id);
  const remaining = items.reduce((sum, i) => sum + outstanding(i), 0);
  const shipped = items.reduce((sum, i) => sum + i.quantityShipped, 0);

  let target: OrderStatus | null = null;
  let shippingStatus: string | undefined;
  if (shipped === 0 && remaining === 0) {
    target = OrderStatus.CANCELLED;
  } else if (shipped > 0 && remaining === 0) {
    target = OrderStatus.SHIPPED;
    shippingStatus = 'SHIPPED';
  } else if (shipped > 0) {
    target = OrderStatus.PARTIALLY_SHIPPED;
    shippingStatus = 'PARTIALLY_SHIPPED';
  }
  if (!target || !SHIPPABLE.includes(order.status)) return order;
  if (target === order.status && target !== OrderStatus.PARTIALLY_SHIPPED) {
    return order;
  }
  if (target !== OrderStatus.CANCELLED) {
    assertOrderTransition(order.status, target);
  }
  return commerce.updateOrderStatus({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: target,
    actorType: 'ADMIN',
    actorId: actor.adminId,
    note: actor.note,
    extra: shippingStatus
      ? { shippingStatus }
      : target === OrderStatus.CANCELLED
        ? { cancellationReason: actor.note }
        : {},
  });
}

/** Runs `work` once per idempotency key; replays the stored result after. */
async function withIdempotency<T>(
  commerce: CommerceRepository,
  config: ConfigService,
  key: string | null | undefined,
  scope: string,
  work: () => Promise<T>,
): Promise<T> {
  const trimmed = key?.trim() || null;
  if (trimmed) {
    const cached = await commerce.getIdempotencyRecord(trimmed, scope);
    if (cached?.responseBody) return cached.responseBody as T;
  }
  const result = await work();
  if (trimmed) {
    await commerce.saveIdempotencyRecord({
      key: trimmed,
      scope,
      responseBody: result,
      statusCode: 201,
      ttlHours: config.get<number>('idempotencyTtlHours') ?? 24,
    });
  }
  return result;
}

@Injectable()
export class CreateShipmentUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly notifier: CustomerNotifier,
    private readonly config: ConfigService,
  ) {}

  /** Ships the given lines, or everything still outstanding when omitted. */
  async execute(input: {
    orderId: string;
    adminId: string;
    items?: LineRequest[];
    carrier?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    note?: string | null;
    idempotencyKey?: string | null;
  }): Promise<{ shipment: Shipment; order: Order }> {
    return this.uow.run(async () => {
      // Lock first so a duplicate request waits, then sees the stored result.
      if (!(await this.commerce.lockOrder(input.orderId))) {
        throw new NotFoundException('Order', input.orderId);
      }
      return withIdempotency(
        this.commerce,
        this.config,
        input.idempotencyKey,
        `admin:shipment:${input.orderId}`,
        () => this.ship(input),
      );
    });
  }

  private async ship(input: Parameters<CreateShipmentUseCase['execute']>[0]) {
    const order = await this.commerce.getOrderById(input.orderId);
    if (!order) throw new NotFoundException('Order', input.orderId);
    if (!SHIPPABLE.includes(order.status)) {
      throw new ConflictException(
        `Orders in status ${order.status} cannot be shipped`,
        'ORDER_NOT_SHIPPABLE',
        { status: order.status },
      );
    }
    const payment = await this.commerce.getPaymentByOrderId(order.id);
    if (
      !payment ||
      ![PaymentStatus.VERIFIED, PaymentStatus.PARTIALLY_REFUNDED].includes(
        payment.status as never,
      )
    ) {
      throw new ValidationException(
        'Payment must be verified before shipping',
        'PAYMENT_NOT_VERIFIED',
      );
    }

    const items = await this.commerce.listOrderItems(order.id);
    const lines = input.items?.length
      ? normaliseLines(input.items, items)
      : items
          .filter((i) => outstanding(i) > 0)
          .map((item) => ({ item, quantity: outstanding(item) }));
    if (!lines.length) {
      throw new ValidationException(
        'There is nothing left to ship on this order',
        'NOTHING_TO_SHIP',
      );
    }
    for (const { item, quantity } of lines) {
      if (quantity > outstanding(item)) {
        throw new ValidationException(
          `Only ${outstanding(item)} of ${item.productName} (${item.sku}) left to ship`,
          'SHIP_QUANTITY_INVALID',
          {
            orderItemId: item.id,
            outstanding: outstanding(item),
            requested: quantity,
          },
        );
      }
    }

    const warehouse = await this.inventory.getDefaultWarehouse();
    if (!warehouse) {
      throw new ValidationException(
        'No default warehouse is configured',
        'WAREHOUSE_REQUIRED',
      );
    }

    // Counters first (guarded): a concurrent duplicate fails here and the
    // whole transaction, including stock deductions, rolls back.
    for (const { item, quantity } of lines) {
      await this.commerce.adjustItemFulfilment(item.id, { shipped: quantity });
    }
    const byVariant = new Map<string, number>();
    for (const { item, quantity } of lines) {
      if (!item.variantId) continue;
      byVariant.set(
        item.variantId,
        (byVariant.get(item.variantId) ?? 0) + quantity,
      );
    }
    for (const [variantId, qty] of [...byVariant].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      await this.inventory.fulfill({
        warehouseId: warehouse.id,
        variantId,
        qty,
        referenceType: 'ORDER',
        referenceId: order.id,
        actorType: 'ADMIN',
        actorId: input.adminId,
      });
    }

    const shipment = await this.commerce.createShipment({
      orderId: order.id,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl,
      note: input.note,
      createdBy: input.adminId,
      items: lines.map(({ item, quantity }) => ({
        orderItemId: item.id,
        quantity,
      })),
    });

    let updated = await syncFulfilmentStatus(this.commerce, order, {
      adminId: input.adminId,
      note:
        input.note?.trim() || `Shipment ${shipment.id.slice(0, 8)} dispatched`,
    });
    // Latest parcel's tracking is shown on the order header.
    if (input.carrier || input.trackingNumber || input.trackingUrl) {
      updated = await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: updated.status,
        toStatus: updated.status,
        actorType: 'SYSTEM',
        visibility: 'INTERNAL',
        note: 'Tracking updated',
        extra: {
          carrier: input.carrier ?? null,
          trackingNumber: input.trackingNumber ?? null,
          trackingUrl: input.trackingUrl ?? null,
        },
      });
    }

    await this.commerce.writeAudit({
      actorType: 'ADMIN',
      actorId: input.adminId,
      action: 'SHIPMENT_CREATED',
      entityType: 'order',
      entityId: order.id,
      after: {
        shipmentId: shipment.id,
        items: shipment.items,
        status: updated.status,
      },
    });

    await this.notifier.notify({
      event: 'ORDER_SHIPPED',
      to: order.email,
      data: {
        orderNumber: order.orderNumber,
        partial: updated.status === OrderStatus.PARTIALLY_SHIPPED,
        items: lines.map(({ item, quantity }) => ({
          name: item.productName,
          sku: item.sku,
          quantity,
        })),
        carrier: input.carrier ?? undefined,
        trackingNumber: input.trackingNumber ?? undefined,
        trackingUrl: input.trackingUrl ?? undefined,
      },
    });

    return { shipment, order: updated };
  }
}

@Injectable()
export class CreateRefundUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly notifier: CustomerNotifier,
    private readonly config: ConfigService,
  ) {}

  /**
   * Records money returned to the customer. Item lines cancel units not yet
   * shipped (releasing their reserved stock) before returning shipped ones
   * (restocked unless `restock: false`, e.g. damaged).
   * `amountPence` omitted = everything not yet refunded.
   */
  async execute(input: {
    orderId: string;
    adminId: string;
    amountPence?: number;
    reason: string;
    reference?: string | null;
    items?: Array<LineRequest & { restock?: boolean }>;
    idempotencyKey?: string | null;
  }): Promise<{ refund: Refund; order: Order }> {
    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new ValidationException(
        'A refund reason is required',
        'REFUND_REASON_REQUIRED',
      );
    }
    return this.uow.run(async () => {
      // Lock first so a duplicate request waits, then sees the stored result.
      if (!(await this.commerce.lockOrder(input.orderId))) {
        throw new NotFoundException('Order', input.orderId);
      }
      return withIdempotency(
        this.commerce,
        this.config,
        input.idempotencyKey,
        `admin:refund:${input.orderId}`,
        () => this.refund({ ...input, reason }),
      );
    });
  }

  private async refund(input: Parameters<CreateRefundUseCase['execute']>[0]) {
    const order = await this.commerce.getOrderById(input.orderId);
    if (!order) throw new NotFoundException('Order', input.orderId);
    const payment = await this.commerce.getPaymentByOrderId(order.id);
    if (!payment || !REFUNDABLE_PAYMENT.includes(payment.status)) {
      throw new ConflictException(
        'Only verified payments can be refunded',
        'PAYMENT_NOT_REFUNDABLE',
        { status: payment?.status },
      );
    }

    const refundable = order.grandTotalPence - order.refundedPence;
    const amount = input.amountPence ?? refundable;
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new ValidationException(
        'Refund amount must be a positive number of pence',
      );
    }
    if (amount > refundable) {
      throw new ValidationException(
        `At most ${(refundable / 100).toFixed(2)} can still be refunded`,
        'REFUND_EXCEEDS_PAID',
        { refundablePence: refundable, requestedPence: amount },
      );
    }

    const items = await this.commerce.listOrderItems(order.id);
    const lines = input.items?.length ? normaliseLines(input.items, items) : [];
    const restockById = new Map(
      (input.items ?? []).map((l) => [l.orderItemId, l.restock !== false]),
    );
    const refundLines: Refund['items'] = [];
    const warehouse = lines.length
      ? await this.inventory.getDefaultWarehouse()
      : null;
    if (lines.length && !warehouse) {
      throw new ValidationException(
        'No default warehouse is configured',
        'WAREHOUSE_REQUIRED',
      );
    }

    for (const { item, quantity } of lines) {
      const cancelQty = Math.min(quantity, outstanding(item));
      const returnQty = quantity - cancelQty;
      const returnable = item.quantityShipped - item.quantityReturned;
      if (returnQty > returnable) {
        throw new ValidationException(
          `Only ${outstanding(item) + returnable} of ${item.productName} (${item.sku}) can be refunded`,
          'REFUND_QUANTITY_INVALID',
          { orderItemId: item.id },
        );
      }
      await this.commerce.adjustItemFulfilment(item.id, {
        cancelled: cancelQty,
        returned: returnQty,
      });
      const restock = returnQty > 0 && restockById.get(item.id) !== false;
      if (item.variantId && warehouse) {
        if (cancelQty > 0) {
          await this.inventory.release({
            warehouseId: warehouse.id,
            variantId: item.variantId,
            qty: cancelQty,
            referenceType: 'ORDER',
            referenceId: order.id,
            actorType: 'ADMIN',
            actorId: input.adminId,
            reason: `Refund: ${input.reason}`,
          });
        }
        if (restock) {
          await this.inventory.adjust({
            warehouseId: warehouse.id,
            variantId: item.variantId,
            onHandDelta: returnQty,
            movementType: 'RETURN',
            actorType: 'ADMIN',
            actorId: input.adminId,
            reason: `Refund: ${input.reason}`,
            referenceType: 'ORDER',
            referenceId: order.id,
          });
        }
      }
      refundLines.push({
        orderItemId: item.id,
        quantityCancelled: cancelQty,
        quantityReturned: returnQty,
        restocked: restock,
      });
    }

    let updated = await this.commerce.addRefundedAmount(order.id, amount);
    const fullyRefunded = updated.refundedPence >= updated.grandTotalPence;
    const nextPayment = fullyRefunded
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED;
    assertPaymentTransition(payment.status, nextPayment);
    await this.commerce.updatePaymentStatus(
      payment.id,
      nextPayment,
      { adminNote: `Refund ${(amount / 100).toFixed(2)}: ${input.reason}` },
      [payment.status],
    );

    const refund = await this.commerce.createRefund({
      orderId: order.id,
      paymentId: payment.id,
      amountPence: amount,
      reason: input.reason,
      reference: input.reference ?? null,
      createdBy: input.adminId,
      items: refundLines,
    });

    updated = (await this.commerce.getOrderById(order.id)) ?? updated;
    if (lines.length) {
      updated = await syncFulfilmentStatus(this.commerce, updated, {
        adminId: input.adminId,
        note: `Refund: ${input.reason}`,
      });
    }
    if (fullyRefunded && updated.status === OrderStatus.RETURNED) {
      updated = await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: OrderStatus.RETURNED,
        toStatus: OrderStatus.REFUNDED,
        actorType: 'ADMIN',
        actorId: input.adminId,
        note: input.reason,
      });
    }

    await this.commerce.writeAudit({
      actorType: 'ADMIN',
      actorId: input.adminId,
      action: 'REFUND_CREATED',
      entityType: 'order',
      entityId: order.id,
      after: { refundId: refund.id, amountPence: amount, items: refundLines },
    });

    await this.notifier.notify({
      event: 'REFUND_ISSUED',
      to: order.email,
      data: {
        orderNumber: order.orderNumber,
        amountPence: amount,
        reason: input.reason,
      },
    });

    return {
      refund,
      order: (await this.commerce.getOrderById(order.id)) ?? updated,
    };
  }
}
