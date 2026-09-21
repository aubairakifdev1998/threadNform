import { describe, expect, it } from 'vitest';
import { canTransitionOrder, OrderStatus } from './order-status.js';

describe('Order status machine', () => {
  it('allows pending payment to cancelled', () => {
    expect(
      canTransitionOrder(OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED),
    ).toBe(true);
  });

  it('blocks delivered to cancelled', () => {
    expect(
      canTransitionOrder(OrderStatus.DELIVERED, OrderStatus.CANCELLED),
    ).toBe(false);
  });

  it('allows confirmed to processing', () => {
    expect(
      canTransitionOrder(OrderStatus.CONFIRMED, OrderStatus.PROCESSING),
    ).toBe(true);
  });
});
