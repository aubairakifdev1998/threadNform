import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictException,
  InvalidTransitionException,
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
} from '../../../domain/repositories/commerce.repository.js';

@Injectable()
export class SubmitPaymentProofUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
  ) {}

  async execute(input: {
    orderNumber: string;
    customerId: string;
    storagePath: string;
    mime: string;
    sizeBytes: number;
    amountClaimedPence?: number | null;
    customerReference?: string | null;
    customerNote?: string | null;
  }) {
    const order = await this.commerce.getOrderByNumber(input.orderNumber);
    if (!order) throw new NotFoundException('Order', input.orderNumber);

    if (order.customerId && order.customerId !== input.customerId) {
      throw new ConflictException(
        'Order does not belong to customer',
        'FORBIDDEN',
      );
    }

    if (!order.customerId) {
      const claimed = await this.commerce.claimGuestOrder(
        order.id,
        input.customerId,
      );
      if (!claimed) {
        const latest = await this.commerce.getOrderById(order.id);
        if (!latest || latest.customerId !== input.customerId) {
          throw new ConflictException(
            'Order does not belong to customer',
            'FORBIDDEN',
          );
        }
      }
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new ValidationException(
        'Cannot submit payment proof for a cancelled order',
        'ORDER_CANCELLED',
      );
    }

    const payment = await this.commerce.getPaymentByOrderId(order.id);
    if (!payment) throw new NotFoundException('Payment');

    if (
      ![
        PaymentStatus.PENDING,
        PaymentStatus.REJECTED,
        PaymentStatus.PROOF_SUBMITTED,
        PaymentStatus.UNDER_REVIEW,
      ].includes(payment.status as never)
    ) {
      throw new InvalidTransitionException(
        'Payment is not accepting proofs',
        'INVALID_PAYMENT_TRANSITION',
        { status: payment.status },
      );
    }

    const proof = await this.commerce.createPaymentProof({
      paymentId: payment.id,
      storagePath: input.storagePath,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      amountClaimedPence: input.amountClaimedPence,
      customerReference: input.customerReference,
      customerNote: input.customerNote,
    });

    if (
      payment.status === PaymentStatus.PENDING ||
      payment.status === PaymentStatus.REJECTED
    ) {
      assertPaymentTransition(payment.status, PaymentStatus.PROOF_SUBMITTED);
      await this.commerce.updatePaymentStatus(
        payment.id,
        PaymentStatus.PROOF_SUBMITTED,
        { amountClaimedPence: input.amountClaimedPence ?? null },
        [payment.status],
      );
      assertPaymentTransition(
        PaymentStatus.PROOF_SUBMITTED,
        PaymentStatus.UNDER_REVIEW,
      );
      await this.commerce.updatePaymentStatus(
        payment.id,
        PaymentStatus.UNDER_REVIEW,
        {},
        [PaymentStatus.PROOF_SUBMITTED],
      );
    } else if (payment.status === PaymentStatus.PROOF_SUBMITTED) {
      await this.commerce.updatePaymentStatus(
        payment.id,
        PaymentStatus.UNDER_REVIEW,
        {},
        [PaymentStatus.PROOF_SUBMITTED],
      );
    }

    const latestOrder = await this.commerce.getOrderById(order.id);
    if (latestOrder?.status === OrderStatus.PENDING_PAYMENT) {
      assertOrderTransition(
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.PAYMENT_SUBMITTED,
      );
      await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: OrderStatus.PENDING_PAYMENT,
        toStatus: OrderStatus.PAYMENT_SUBMITTED,
        actorType: 'CUSTOMER',
        actorId: input.customerId,
        note: 'Payment proof uploaded',
        extra: { paymentStatus: PaymentStatus.UNDER_REVIEW },
      });
      await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: OrderStatus.PAYMENT_SUBMITTED,
        toStatus: OrderStatus.PAYMENT_UNDER_REVIEW,
        actorType: 'SYSTEM',
        note: 'Payment under review',
        extra: { paymentStatus: PaymentStatus.UNDER_REVIEW },
      });
    } else if (latestOrder?.status === OrderStatus.PAYMENT_SUBMITTED) {
      await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: OrderStatus.PAYMENT_SUBMITTED,
        toStatus: OrderStatus.PAYMENT_UNDER_REVIEW,
        actorType: 'SYSTEM',
        note: 'Payment under review',
        extra: { paymentStatus: PaymentStatus.UNDER_REVIEW },
      });
    }

    await this.commerce.writeAudit({
      actorType: 'CUSTOMER',
      actorId: input.customerId,
      action: 'PAYMENT_PROOF_UPLOADED',
      entityType: 'payment',
      entityId: payment.id,
      after: { proofId: proof.id },
    });

    return proof;
  }
}
