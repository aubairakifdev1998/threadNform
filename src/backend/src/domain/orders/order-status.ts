import { InvalidTransitionException } from '../exceptions/domain.exception.js';

export const OrderStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_SUBMITTED: 'PAYMENT_SUBMITTED',
  PAYMENT_UNDER_REVIEW: 'PAYMENT_UNDER_REVIEW',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  PACKED: 'PACKED',
  PARTIALLY_SHIPPED: 'PARTIALLY_SHIPPED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  RETURNED: 'RETURNED',
  REFUNDED: 'REFUNDED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ['PAYMENT_SUBMITTED', 'CANCELLED'],
  PAYMENT_SUBMITTED: ['PAYMENT_UNDER_REVIEW', 'CANCELLED'],
  PAYMENT_UNDER_REVIEW: ['CONFIRMED', 'PAYMENT_SUBMITTED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'CANCELLED'],
  PROCESSING: ['PACKED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'PARTIALLY_SHIPPED', 'CANCELLED'],
  // Further parcels keep the order here until every unit is shipped or cancelled.
  PARTIALLY_SHIPPED: ['PARTIALLY_SHIPPED', 'SHIPPED'],
  SHIPPED: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['RETURN_REQUESTED'],
  CANCELLED: [],
  // A declined return puts the order back to DELIVERED; goods already left
  // the warehouse, so cancelling at this point is not meaningful.
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  RETURNED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(
  from: OrderStatus,
  to: OrderStatus,
): void {
  if (!canTransitionOrder(from, to)) {
    throw new InvalidTransitionException(
      `Invalid order transition from ${from} to ${to}`,
      'INVALID_ORDER_TRANSITION',
      { from, to },
    );
  }
}

export function isCancellable(status: OrderStatus): boolean {
  return ![
    OrderStatus.PARTIALLY_SHIPPED,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.RETURN_REQUESTED,
    OrderStatus.RETURNED,
    OrderStatus.REFUNDED,
  ].includes(status as never);
}
