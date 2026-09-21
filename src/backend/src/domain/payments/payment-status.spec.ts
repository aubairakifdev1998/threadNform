import { describe, expect, it } from 'vitest';
import { canTransitionPayment, PaymentStatus } from './payment-status.js';

describe('Payment status machine', () => {
  it('requires review before verify', () => {
    expect(
      canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.VERIFIED),
    ).toBe(false);
    expect(
      canTransitionPayment(PaymentStatus.UNDER_REVIEW, PaymentStatus.VERIFIED),
    ).toBe(true);
  });

  it('allows reject then new proof', () => {
    expect(
      canTransitionPayment(PaymentStatus.UNDER_REVIEW, PaymentStatus.REJECTED),
    ).toBe(true);
    expect(
      canTransitionPayment(PaymentStatus.REJECTED, PaymentStatus.PROOF_SUBMITTED),
    ).toBe(true);
  });
});
