import { describe, expect, it } from 'vitest';
import {
  assertOrderTransition,
  canTransitionOrder,
  isCancellable,
  OrderStatus,
} from './order-status.js';

describe('Order status machine — edge cases', () => {
  it('happy path: pending → submitted → review → confirmed → shipped → delivered', () => {
    const path: OrderStatus[] = [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAYMENT_SUBMITTED,
      OrderStatus.PAYMENT_UNDER_REVIEW,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.PACKED,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionOrder(path[i], path[i + 1])).toBe(true);
    }
  });

  it('blocks skipping statuses (pending → confirmed)', () => {
    expect(
      canTransitionOrder(OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED),
    ).toBe(false);
  });

  it('blocks transitions out of cancelled and refunded', () => {
    expect(
      canTransitionOrder(OrderStatus.CANCELLED, OrderStatus.CONFIRMED),
    ).toBe(false);
    expect(
      canTransitionOrder(OrderStatus.REFUNDED, OrderStatus.DELIVERED),
    ).toBe(false);
  });

  it('assertOrderTransition throws on illegal move', () => {
    expect(() =>
      assertOrderTransition(OrderStatus.SHIPPED, OrderStatus.CANCELLED),
    ).toThrow(/Invalid order transition/);
  });

  it('isCancellable false after ship / return / refund / cancel', () => {
    for (const status of [
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      OrderStatus.RETURN_REQUESTED,
      OrderStatus.RETURNED,
      OrderStatus.REFUNDED,
    ]) {
      expect(isCancellable(status)).toBe(false);
    }
  });

  it('isCancellable true while still in warehouse flow', () => {
    for (const status of [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.PACKED,
    ]) {
      expect(isCancellable(status)).toBe(true);
    }
  });

  it('return path after ship', () => {
    expect(
      canTransitionOrder(OrderStatus.SHIPPED, OrderStatus.RETURN_REQUESTED),
    ).toBe(true);
    expect(
      canTransitionOrder(OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED),
    ).toBe(true);
    expect(canTransitionOrder(OrderStatus.RETURNED, OrderStatus.REFUNDED)).toBe(
      true,
    );
  });
});
