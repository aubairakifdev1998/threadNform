import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvalidTransitionException,
  NotFoundException,
  ValidationException,
} from '../../../domain/exceptions/domain.exception.js';
import {
  OrderStatus,
  assertOrderTransition,
  isCancellable,
} from '../../../domain/orders/order-status.js';
import {
  PaymentStatus,
  assertPaymentTransition,
} from '../../../domain/payments/payment-status.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
  type OrderItem,
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
import {
  CreateRefundUseCase,
  CreateShipmentUseCase,
} from './fulfilment.use-cases.js';

const APPROVE_SCOPE = 'admin:payment-approve';

/** Sums quantities per variant (an order may list a variant more than once). */
function quantitiesByVariant(items: OrderItem[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item.variantId) continue;
    totals.set(
      item.variantId,
      (totals.get(item.variantId) ?? 0) + item.quantity,
    );
  }
  return new Map([...totals.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

@Injectable()
export class ApprovePaymentUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly config: ConfigService,
    private readonly notifier: CustomerNotifier,
  ) {}

  async execute(input: {
    paymentId: string;
    adminId: string;
    idempotencyKey?: string | null;
    note?: string | null;
  }) {
    const key = input.idempotencyKey?.trim() || null;
    if (key) {
      const cached = await this.commerce.getIdempotencyRecord(
        key,
        `${APPROVE_SCOPE}:${input.paymentId}`,
      );
      if (cached?.responseBody && typeof cached.responseBody === 'object') {
        return cached.responseBody as {
          payment: Awaited<ReturnType<CommerceRepository['getPaymentById']>>;
          alreadyVerified: boolean;
          idempotentReplay: boolean;
        };
      }
    }

    return this.uow.run(async () => {
      const payment = await this.commerce.getPaymentById(input.paymentId);
      if (!payment) throw new NotFoundException('Payment', input.paymentId);

      if (payment.status === PaymentStatus.VERIFIED) {
        const replay = {
          payment,
          alreadyVerified: true,
          idempotentReplay: false,
        };
        if (key) {
          await this.persistApproveIdempotency(key, input.paymentId, replay);
        }
        return replay;
      }

      if (
        payment.status !== PaymentStatus.UNDER_REVIEW &&
        payment.status !== PaymentStatus.PROOF_SUBMITTED
      ) {
        throw new InvalidTransitionException(
          'Payment cannot be approved in current state',
          'INVALID_PAYMENT_TRANSITION',
          { status: payment.status },
        );
      }

      const order = await this.commerce.getOrderById(payment.orderId);
      if (!order) throw new NotFoundException('Order');

      if (order.status === OrderStatus.CANCELLED) {
        throw new ValidationException(
          'Cannot approve payment for a cancelled order',
          'ORDER_CANCELLED',
        );
      }

      if (
        ![
          OrderStatus.PENDING_PAYMENT,
          OrderStatus.PAYMENT_SUBMITTED,
          OrderStatus.PAYMENT_UNDER_REVIEW,
        ].includes(order.status as never)
      ) {
        throw new ValidationException(
          'Order is not awaiting payment verification',
          'ORDER_NOT_AWAITING_PAYMENT',
        );
      }

      const proofs = await this.commerce.listPaymentProofs(payment.id);
      if (proofs.length === 0) {
        throw new ValidationException(
          'Cannot approve payment without uploaded proof evidence',
          'PAYMENT_PROOF_REQUIRED',
        );
      }

      if (payment.status === PaymentStatus.PROOF_SUBMITTED) {
        await this.commerce.updatePaymentStatus(
          payment.id,
          PaymentStatus.UNDER_REVIEW,
          {},
          [PaymentStatus.PROOF_SUBMITTED],
        );
      }

      assertPaymentTransition(
        PaymentStatus.UNDER_REVIEW,
        PaymentStatus.VERIFIED,
      );
      const updated = await this.commerce.updatePaymentStatus(
        payment.id,
        PaymentStatus.VERIFIED,
        { adminNote: input.note ?? null },
        [PaymentStatus.UNDER_REVIEW],
      );

      let fromStatus = order.status;
      if (fromStatus === OrderStatus.PENDING_PAYMENT) {
        await this.commerce.updateOrderStatus({
          orderId: order.id,
          fromStatus: OrderStatus.PENDING_PAYMENT,
          toStatus: OrderStatus.PAYMENT_SUBMITTED,
          actorType: 'SYSTEM',
          note: 'Payment verified — advancing status',
          visibility: 'INTERNAL',
        });
        fromStatus = OrderStatus.PAYMENT_SUBMITTED;
      }
      if (fromStatus === OrderStatus.PAYMENT_SUBMITTED) {
        await this.commerce.updateOrderStatus({
          orderId: order.id,
          fromStatus: OrderStatus.PAYMENT_SUBMITTED,
          toStatus: OrderStatus.PAYMENT_UNDER_REVIEW,
          actorType: 'SYSTEM',
          note: 'Payment verified — advancing status',
          visibility: 'INTERNAL',
        });
      }

      assertOrderTransition(
        OrderStatus.PAYMENT_UNDER_REVIEW,
        OrderStatus.CONFIRMED,
      );
      await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: OrderStatus.PAYMENT_UNDER_REVIEW,
        toStatus: OrderStatus.CONFIRMED,
        actorType: 'ADMIN',
        actorId: input.adminId,
        note: input.note ?? 'Payment verified',
      });

      await this.commerce.writeAudit({
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'PAYMENT_APPROVED',
        entityType: 'payment',
        entityId: payment.id,
        before: { status: payment.status },
        after: { status: PaymentStatus.VERIFIED, idempotencyKey: key },
      });

      await this.notifier.notify({
        event: 'PAYMENT_APPROVED',
        to: order.email,
        data: { orderNumber: order.orderNumber },
      });

      const result = {
        payment: updated,
        alreadyVerified: false,
        idempotentReplay: false,
      };
      if (key) {
        await this.persistApproveIdempotency(key, input.paymentId, result);
      }
      return result;
    });
  }

  private async persistApproveIdempotency(
    key: string,
    paymentId: string,
    responseBody: unknown,
  ) {
    const ttlHours = this.config.get<number>('idempotencyTtlHours') ?? 24;
    await this.commerce.saveIdempotencyRecord({
      key,
      scope: `${APPROVE_SCOPE}:${paymentId}`,
      responseBody: { ...(responseBody as object), idempotentReplay: true },
      statusCode: 200,
      ttlHours,
    });
  }
}

@Injectable()
export class RejectPaymentUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly notifier: CustomerNotifier,
  ) {}

  async execute(input: { paymentId: string; adminId: string; reason: string }) {
    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new ValidationException(
        'Rejection reason is required',
        'REJECT_REASON_REQUIRED',
      );
    }

    return this.uow.run(async () => {
      const payment = await this.commerce.getPaymentById(input.paymentId);
      if (!payment) throw new NotFoundException('Payment', input.paymentId);

      if (
        payment.status !== PaymentStatus.UNDER_REVIEW &&
        payment.status !== PaymentStatus.PROOF_SUBMITTED
      ) {
        throw new InvalidTransitionException(
          'Payment cannot be rejected in current state',
          'INVALID_PAYMENT_TRANSITION',
          { status: payment.status },
        );
      }

      const order = await this.commerce.getOrderById(payment.orderId);
      if (order?.status === OrderStatus.CANCELLED) {
        throw new ValidationException(
          'Cannot reject payment for a cancelled order',
          'ORDER_CANCELLED',
        );
      }

      if (payment.status === PaymentStatus.PROOF_SUBMITTED) {
        await this.commerce.updatePaymentStatus(
          payment.id,
          PaymentStatus.UNDER_REVIEW,
          {},
          [PaymentStatus.PROOF_SUBMITTED],
        );
      }

      assertPaymentTransition(
        PaymentStatus.UNDER_REVIEW,
        PaymentStatus.REJECTED,
      );
      const updated = await this.commerce.updatePaymentStatus(
        payment.id,
        PaymentStatus.REJECTED,
        { adminNote: reason },
        [PaymentStatus.UNDER_REVIEW],
      );

      if (order && order.status === OrderStatus.PAYMENT_UNDER_REVIEW) {
        assertOrderTransition(
          OrderStatus.PAYMENT_UNDER_REVIEW,
          OrderStatus.PAYMENT_SUBMITTED,
        );
        await this.commerce.updateOrderStatus({
          orderId: order.id,
          fromStatus: OrderStatus.PAYMENT_UNDER_REVIEW,
          toStatus: OrderStatus.PAYMENT_SUBMITTED,
          actorType: 'ADMIN',
          actorId: input.adminId,
          note: `Payment rejected: ${reason}`,
        });
      }

      await this.commerce.writeAudit({
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'PAYMENT_REJECTED',
        entityType: 'payment',
        entityId: payment.id,
        after: { reason },
      });

      if (order) {
        await this.notifier.notify({
          event: 'PAYMENT_REJECTED',
          to: order.email,
          data: { orderNumber: order.orderNumber, reason },
        });
      }

      return updated;
    });
  }
}

@Injectable()
export class CancelOrderUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly notifier: CustomerNotifier,
  ) {}

  async execute(input: {
    orderId: string;
    actorType: string;
    actorId?: string | null;
    reason: string;
  }) {
    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new ValidationException(
        'A cancellation reason is required',
        'CANCEL_REASON_REQUIRED',
      );
    }

    return this.uow.run(async () => {
      const order = await this.commerce.getOrderById(input.orderId);
      if (!order) throw new NotFoundException('Order', input.orderId);

      if (!isCancellable(order.status)) {
        throw new ValidationException(
          order.status === OrderStatus.CANCELLED
            ? 'Order is already cancelled'
            : 'Order cannot be cancelled after shipment; use returns',
          'ORDER_NOT_CANCELLABLE',
          { status: order.status },
        );
      }

      assertOrderTransition(order.status, OrderStatus.CANCELLED);
      const updated = await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: OrderStatus.CANCELLED,
        actorType: input.actorType,
        actorId: input.actorId,
        note: reason,
        extra: { cancellationReason: reason },
      });

      // Money already confirmed must be refunded: flag it for finance.
      const payment = await this.commerce.getPaymentByOrderId(order.id);
      let refundRequired = false;
      if (payment?.status === PaymentStatus.VERIFIED) {
        await this.commerce.updatePaymentStatus(
          payment.id,
          PaymentStatus.REFUND_PENDING,
          { adminNote: `Order cancelled: ${reason}` },
          [PaymentStatus.VERIFIED],
        );
        refundRequired = true;
      }

      const items = await this.commerce.listOrderItems(order.id);
      for (const item of items) {
        const outstanding =
          item.quantity - item.quantityShipped - item.quantityCancelled;
        if (outstanding > 0) {
          await this.commerce.adjustItemFulfilment(item.id, {
            cancelled: outstanding,
          });
        }
      }
      const warehouse = await this.inventory.getDefaultWarehouse();
      if (warehouse) {
        for (const [variantId] of quantitiesByVariant(items)) {
          await this.inventory.setHold({
            warehouseId: warehouse.id,
            variantId,
            quantity: 0,
            referenceType: 'ORDER',
            referenceId: order.id,
            actorType: input.actorType,
            actorId: input.actorId,
            reason: `Order ${order.orderNumber} cancelled: ${reason}`,
          });
        }
      }

      await this.commerce.writeAudit({
        actorType: input.actorType,
        actorId: input.actorId,
        action: 'ORDER_CANCELLED',
        entityType: 'order',
        entityId: order.id,
        before: { status: order.status, paymentStatus: payment?.status },
        after: { reason, refundRequired },
      });

      await this.notifier.notify({
        event: 'ORDER_CANCELLED',
        to: order.email,
        data: { orderNumber: order.orderNumber, reason, refundRequired },
      });

      const latest = (await this.commerce.getOrderById(order.id)) ?? updated;
      return { ...latest, refundRequired };
    });
  }
}

@Injectable()
export class TransitionOrderStatusUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly cancelOrder: CancelOrderUseCase,
    private readonly notifier: CustomerNotifier,
    private readonly createShipment: CreateShipmentUseCase,
    private readonly createRefund: CreateRefundUseCase,
  ) {}

  async execute(input: {
    orderId: string;
    toStatus: OrderStatus;
    adminId: string;
    note?: string | null;
    /** RETURNED only: put the returned units back into sellable stock (default true). */
    restock?: boolean;
    tracking?: {
      carrier?: string;
      trackingNumber?: string;
      trackingUrl?: string;
    };
  }) {
    if (input.toStatus === OrderStatus.CANCELLED) {
      return this.cancelOrder.execute({
        orderId: input.orderId,
        actorType: 'ADMIN',
        actorId: input.adminId,
        reason: input.note?.trim() || 'Cancelled by admin',
      });
    }

    if (input.toStatus === OrderStatus.SHIPPED) {
      // "Ship everything that is left" — same path as a partial shipment.
      const { order } = await this.createShipment.execute({
        orderId: input.orderId,
        adminId: input.adminId,
        carrier: input.tracking?.carrier,
        trackingNumber: input.tracking?.trackingNumber,
        trackingUrl: input.tracking?.trackingUrl,
        note: input.note,
      });
      return order;
    }

    if (input.toStatus === OrderStatus.PARTIALLY_SHIPPED) {
      throw new ValidationException(
        'Create a shipment with the items being sent to ship part of an order',
        'USE_SHIPMENTS_ENDPOINT',
      );
    }

    if (input.toStatus === OrderStatus.REFUNDED) {
      const current = await this.commerce.getOrderById(input.orderId);
      if (!current) throw new NotFoundException('Order', input.orderId);
      assertOrderTransition(current.status, OrderStatus.REFUNDED);
      const { order } = await this.createRefund.execute({
        orderId: input.orderId,
        adminId: input.adminId,
        reason: input.note?.trim() || 'Order refunded after return',
      });
      return order;
    }

    if (
      input.toStatus === OrderStatus.PAYMENT_SUBMITTED ||
      input.toStatus === OrderStatus.PAYMENT_UNDER_REVIEW
    ) {
      throw new ValidationException(
        'Payment review statuses are set when the customer uploads proof',
        'INVALID_ORDER_TRANSITION',
      );
    }

    return this.uow.run(async () => {
      const order = await this.commerce.getOrderById(input.orderId);
      if (!order) throw new NotFoundException('Order', input.orderId);

      assertOrderTransition(order.status, input.toStatus);

      const payment = await this.commerce.getPaymentByOrderId(order.id);
      if (input.toStatus === OrderStatus.CONFIRMED) {
        if (!payment || payment.status !== PaymentStatus.VERIFIED) {
          throw new ValidationException(
            'Review and approve payment proof before confirming this order',
            'PAYMENT_NOT_VERIFIED',
          );
        }
      }

      const extra: Record<string, unknown> = {};
      if (input.toStatus === OrderStatus.PACKED) {
        extra.shippingStatus = 'READY_TO_SHIP';
      }
      if (input.toStatus === OrderStatus.DELIVERED) {
        extra.shippingStatus = 'DELIVERED';
      }

      const needsStock =
        input.toStatus === OrderStatus.RETURNED && input.restock !== false;
      const warehouse = needsStock
        ? await this.inventory.getDefaultWarehouse()
        : null;
      if (needsStock && !warehouse) {
        throw new ValidationException(
          'No default warehouse is configured',
          'WAREHOUSE_REQUIRED',
        );
      }

      // Status first: a concurrent duplicate request fails here (conflict)
      // and the whole transaction, including stock moves, rolls back.
      const updated = await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: input.toStatus,
        actorType: 'ADMIN',
        actorId: input.adminId,
        note: input.note ?? null,
        extra,
      });

      if (input.toStatus === OrderStatus.RETURNED) {
        // Only units not already returned through a refund.
        const returned = new Map<string, number>();
        for (const item of await this.commerce.listOrderItems(order.id)) {
          const qty = item.quantityShipped - item.quantityReturned;
          if (qty <= 0) continue;
          await this.commerce.adjustItemFulfilment(item.id, { returned: qty });
          if (item.variantId) {
            returned.set(
              item.variantId,
              (returned.get(item.variantId) ?? 0) + qty,
            );
          }
        }
        if (warehouse) {
          for (const [variantId, qty] of returned) {
            await this.inventory.adjust({
              warehouseId: warehouse.id,
              variantId,
              onHandDelta: qty,
              movementType: 'RETURN',
              actorType: 'ADMIN',
              actorId: input.adminId,
              reason: `Order ${order.orderNumber} returned`,
              referenceType: 'ORDER',
              referenceId: order.id,
            });
          }
        }
      }

      await this.commerce.writeAudit({
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'order',
        entityId: order.id,
        before: { status: order.status },
        after: {
          status: input.toStatus,
          ...(input.toStatus === OrderStatus.RETURNED
            ? { restocked: input.restock !== false }
            : {}),
        },
      });

      if (input.toStatus === OrderStatus.DELIVERED) {
        await this.notifier.notify({
          event: 'ORDER_DELIVERED',
          to: order.email,
          data: { orderNumber: order.orderNumber },
        });
      }

      // Payment changes above update orders.payment_status; return fresh state.
      return (await this.commerce.getOrderById(order.id)) ?? updated;
    });
  }
}
