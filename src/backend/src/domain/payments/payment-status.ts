import { InvalidTransitionException } from '../exceptions/domain.exception.js';

export const PaymentStatus = {
  PENDING: 'PENDING',
  PROOF_SUBMITTED: 'PROOF_SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['PROOF_SUBMITTED', 'REFUND_PENDING'],
  PROOF_SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['VERIFIED', 'REJECTED'],
  REJECTED: ['PROOF_SUBMITTED'],
  VERIFIED: ['REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): void {
  if (!canTransitionPayment(from, to)) {
    throw new InvalidTransitionException(
      `Invalid payment transition from ${from} to ${to}`,
      'INVALID_PAYMENT_TRANSITION',
      { from, to },
    );
  }
}
