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
} from '../../../domain/repositories/commerce.repository.js';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../../domain/repositories/inventory.repository.js';

const APPROVE_SCOPE = 'admin:payment-approve';

@Injectable()
export class ApprovePaymentUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    private readonly config: ConfigService,
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

    const payment = await this.commerce.getPaymentById(input.paymentId);
    if (!payment) throw new NotFoundException('Payment', input.paymentId);

    if (payment.status === PaymentStatus.VERIFIED) {
      const replay = { payment, alreadyVerified: true, idempotentReplay: false };
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

    assertPaymentTransition(PaymentStatus.UNDER_REVIEW, PaymentStatus.VERIFIED);
    const updated = await this.commerce.updatePaymentStatus(
      payment.id,
      PaymentStatus.VERIFIED,
      { adminNote: input.note ?? null },
      [PaymentStatus.UNDER_REVIEW],
    );

    let fromStatus = order.status;
    if (fromStatus === OrderStatus.PENDING_PAYMENT) {
      assertOrderTransition(
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.PAYMENT_SUBMITTED,
      );
      await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: OrderStatus.PENDING_PAYMENT,
        toStatus: OrderStatus.PAYMENT_SUBMITTED,
        actorType: 'SYSTEM',
        note: 'Payment verified — advancing status',
        extra: { paymentStatus: PaymentStatus.VERIFIED },
      });
      fromStatus = OrderStatus.PAYMENT_SUBMITTED;
    }
    if (fromStatus === OrderStatus.PAYMENT_SUBMITTED) {
      assertOrderTransition(
        OrderStatus.PAYMENT_SUBMITTED,
        OrderStatus.PAYMENT_UNDER_REVIEW,
      );
      await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: OrderStatus.PAYMENT_SUBMITTED,
        toStatus: OrderStatus.PAYMENT_UNDER_REVIEW,
        actorType: 'SYSTEM',
        note: 'Payment verified — advancing status',
        extra: { paymentStatus: PaymentStatus.VERIFIED },
      });
      fromStatus = OrderStatus.PAYMENT_UNDER_REVIEW;
    }

    assertOrderTransition(OrderStatus.PAYMENT_UNDER_REVIEW, OrderStatus.CONFIRMED);
    await this.commerce.updateOrderStatus({
      orderId: order.id,
      fromStatus: OrderStatus.PAYMENT_UNDER_REVIEW,
      toStatus: OrderStatus.CONFIRMED,
      actorType: 'ADMIN',
      actorId: input.adminId,
      note: input.note ?? 'Payment verified',
      extra: { paymentStatus: PaymentStatus.VERIFIED },
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

    const result = {
      payment: updated,
      alreadyVerified: false,
      idempotentReplay: false,
    };
    if (key) {
      await this.persistApproveIdempotency(key, input.paymentId, result);
    }
    return result;
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
  ) {}

  async execute(input: {
    paymentId: string;
    adminId: string;
    reason: string;
  }) {
    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new ValidationException(
        'Rejection reason is required',
        'REJECT_REASON_REQUIRED',
      );
    }

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

    assertPaymentTransition(PaymentStatus.UNDER_REVIEW, PaymentStatus.REJECTED);
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
        extra: { paymentStatus: PaymentStatus.REJECTED },
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

    return updated;
  }
}

@Injectable()
export class CancelOrderUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(INVENTORY_REPOSITORY) private readonly inventory: InventoryRepository,
  ) {}

  async execute(input: {
    orderId: string;
    actorType: string;
    actorId?: string | null;
    reason: string;
  }) {
    const order = await this.commerce.getOrderById(input.orderId);
    if (!order) throw new NotFoundException('Order', input.orderId);

    if (!isCancellable(order.status)) {
      throw new ValidationException(
        'Order cannot be cancelled after shipment; use returns',
        'ORDER_NOT_CANCELLABLE',
      );
    }

    assertOrderTransition(order.status, OrderStatus.CANCELLED);
    const updated = await this.commerce.updateOrderStatus({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.CANCELLED,
      actorType: input.actorType,
      actorId: input.actorId,
      note: input.reason,
      extra: { cancellationReason: input.reason },
    });

    const warehouse = await this.inventory.getDefaultWarehouse();
    const items = await this.commerce.listOrderItems(order.id);
    if (warehouse) {
      for (const item of items) {
        if (!item.variantId) continue;
        try {
          await this.inventory.release({
            warehouseId: warehouse.id,
            variantId: item.variantId,
            qty: item.quantity,
            referenceType: 'ORDER',
            referenceId: order.id,
            actorType: input.actorType,
            actorId: input.actorId,
            reason: input.reason,
          });
        } catch {
          // Already released
        }
      }
    }

    await this.commerce.writeAudit({
      actorType: input.actorType,
      actorId: input.actorId,
      action: 'ORDER_CANCELLED',
      entityType: 'order',
      entityId: order.id,
      after: { reason: input.reason },
    });

    return updated;
  }
}

@Injectable()
export class TransitionOrderStatusUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(INVENTORY_REPOSITORY) private readonly inventory: InventoryRepository,
    private readonly cancelOrder: CancelOrderUseCase,
  ) {}

  async execute(input: {
    orderId: string;
    toStatus: OrderStatus;
    adminId: string;
    note?: string | null;
    tracking?: {
      carrier?: string;
      trackingNumber?: string;
      trackingUrl?: string;
    };
  }) {
    const order = await this.commerce.getOrderById(input.orderId);
    if (!order) throw new NotFoundException('Order', input.orderId);

    assertOrderTransition(order.status, input.toStatus);

    if (input.toStatus === OrderStatus.CANCELLED) {
      return this.cancelOrder.execute({
        orderId: order.id,
        actorType: 'ADMIN',
        actorId: input.adminId,
        reason: input.note?.trim() || 'Cancelled by admin',
      });
    }

    if (input.toStatus === OrderStatus.CONFIRMED) {
      const payment = await this.commerce.getPaymentByOrderId(order.id);
      if (!payment || payment.status !== PaymentStatus.VERIFIED) {
        throw new ValidationException(
          'Review and approve payment proof before confirming this order',
          'PAYMENT_NOT_VERIFIED',
        );
      }
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

    const extra: Record<string, unknown> = {};
    if (input.toStatus === OrderStatus.SHIPPED) {
      extra.shippingStatus = 'SHIPPED';
      if (input.tracking?.carrier) extra.carrier = input.tracking.carrier;
      if (input.tracking?.trackingNumber)
        extra.trackingNumber = input.tracking.trackingNumber;
      if (input.tracking?.trackingUrl)
        extra.trackingUrl = input.tracking.trackingUrl;
    }
    if (input.toStatus === OrderStatus.DELIVERED) {
      extra.shippingStatus = 'DELIVERED';
    }
    if (input.toStatus === OrderStatus.PACKED) {
      extra.shippingStatus = 'READY_TO_SHIP';
    }

    if (input.toStatus === OrderStatus.SHIPPED) {
      const warehouse = await this.inventory.getDefaultWarehouse();
      if (!warehouse) {
        throw new ValidationException(
          'Cannot ship without a default warehouse',
          'WAREHOUSE_REQUIRED',
        );
      }
      const items = await this.commerce.listOrderItems(order.id);
      for (const item of items) {
        if (!item.variantId) continue;
        try {
          await this.inventory.fulfill({
            warehouseId: warehouse.id,
            variantId: item.variantId,
            qty: item.quantity,
            referenceType: 'ORDER',
            referenceId: order.id,
            actorType: 'ADMIN',
            actorId: input.adminId,
          });
        } catch (error) {
          throw new ValidationException(
            `Failed to deduct stock for variant ${item.variantId}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
            'INVENTORY_FULFILL_FAILED',
          );
        }
      }
    }

    const updated = await this.commerce.updateOrderStatus({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: input.toStatus,
      actorType: 'ADMIN',
      actorId: input.adminId,
      note: input.note ?? null,
      extra,
    });

    await this.commerce.writeAudit({
      actorType: 'ADMIN',
      actorId: input.adminId,
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'order',
      entityId: order.id,
      before: { status: order.status },
      after: { status: input.toStatus },
    });

    return updated;
  }
}
