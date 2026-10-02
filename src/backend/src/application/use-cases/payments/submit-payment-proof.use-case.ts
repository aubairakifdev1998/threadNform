import { Inject, Injectable } from '@nestjs/common';
import {
  ForbiddenException,
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
import {
  STORAGE_REPOSITORY,
  type StorageRepository,
} from '../../../domain/repositories/storage.repository.js';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../domain/repositories/unit-of-work.js';

const ACCEPTING_PROOF: readonly string[] = [
  PaymentStatus.PENDING,
  PaymentStatus.REJECTED,
  PaymentStatus.PROOF_SUBMITTED,
  PaymentStatus.UNDER_REVIEW,
];

@Injectable()
export class SubmitPaymentProofUseCase {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(STORAGE_REPOSITORY) private readonly storage: StorageRepository,
  ) {}

  async execute(input: {
    bucket: string;
    orderNumber: string;
    customerId: string;
    customerEmail: string;
    storagePath: string;
    mime: string;
    sizeBytes: number;
    amountClaimedPence?: number | null;
    customerReference?: string | null;
    customerNote?: string | null;
  }) {
    return this.uow.run(async () => {
      const order = await this.commerce.getOrderByNumber(input.orderNumber);
      if (!order) throw new NotFoundException('Order', input.orderNumber);

      const ownsOrder = order.customerId
        ? order.customerId === input.customerId
        : order.email === input.customerEmail.trim().toLowerCase();
      if (!ownsOrder) {
        throw new ForbiddenException(
          order.customerId
            ? 'You can only upload proof for your own orders'
            : 'Sign in with the email used at checkout to upload proof',
        );
      }

      if (order.status === OrderStatus.CANCELLED) {
        throw new ValidationException(
          'Cannot submit payment proof for a cancelled order',
          'ORDER_CANCELLED',
        );
      }

      const payment = await this.commerce.getPaymentByOrderId(order.id);
      if (!payment) throw new NotFoundException('Payment');

      if (!ACCEPTING_PROOF.includes(payment.status)) {
        throw new InvalidTransitionException(
          payment.status === PaymentStatus.VERIFIED
            ? 'Payment is already verified for this order'
            : 'Payment is not accepting proofs',
          payment.status === PaymentStatus.VERIFIED
            ? 'PAYMENT_ALREADY_VERIFIED'
            : 'INVALID_PAYMENT_TRANSITION',
          { status: payment.status },
        );
      }

      // Retried submission of the same uploaded file: return the first record.
      const duplicate = await this.commerce.findPaymentProofByPath(
        payment.id,
        input.storagePath,
      );
      if (duplicate) return duplicate;

      if (!(await this.storage.exists(input.bucket, input.storagePath))) {
        throw new ValidationException(
          'We could not find the uploaded file. Please upload it again.',
          'PROOF_FILE_MISSING',
        );
      }

      if (!order.customerId) {
        await this.commerce.claimGuestOrder(order.id, input.customerId);
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
      }
      if (payment.status !== PaymentStatus.UNDER_REVIEW) {
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
      }

      if (order.status === OrderStatus.PENDING_PAYMENT) {
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
        });
      }
      if (
        order.status === OrderStatus.PENDING_PAYMENT ||
        order.status === OrderStatus.PAYMENT_SUBMITTED
      ) {
        await this.commerce.updateOrderStatus({
          orderId: order.id,
          fromStatus: OrderStatus.PAYMENT_SUBMITTED,
          toStatus: OrderStatus.PAYMENT_UNDER_REVIEW,
          actorType: 'SYSTEM',
          note: 'Payment under review',
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
    });
  }
}
