import { describe, expect, it } from 'vitest';
import {
  assertPaymentTransition,
  canTransitionPayment,
  PaymentStatus,
} from './payment-status.js';

describe('Payment status machine — edge cases', () => {
  it('happy path: pending → proof → review → verified', () => {
    expect(
      canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.PROOF_SUBMITTED),
    ).toBe(true);
    expect(
      canTransitionPayment(
        PaymentStatus.PROOF_SUBMITTED,
        PaymentStatus.UNDER_REVIEW,
      ),
    ).toBe(true);
    expect(
      canTransitionPayment(PaymentStatus.UNDER_REVIEW, PaymentStatus.VERIFIED),
    ).toBe(true);
  });

  it('allows reject then re-submit proof', () => {
    expect(
      canTransitionPayment(PaymentStatus.UNDER_REVIEW, PaymentStatus.REJECTED),
    ).toBe(true);
    expect(
      canTransitionPayment(PaymentStatus.REJECTED, PaymentStatus.PROOF_SUBMITTED),
    ).toBe(true);
  });

  it('blocks verify from pending without proof', () => {
    expect(
      canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.VERIFIED),
    ).toBe(false);
  });

  it('blocks transitions after refunded', () => {
    expect(
      canTransitionPayment(PaymentStatus.REFUNDED, PaymentStatus.PENDING),
    ).toBe(false);
  });

  it('assertPaymentTransition throws on illegal move', () => {
    expect(() =>
      assertPaymentTransition(PaymentStatus.VERIFIED, PaymentStatus.REJECTED),
    ).toThrow(/Invalid payment transition/);
  });
});
