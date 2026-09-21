import { InvalidTransitionException } from '../exceptions/domain.exception.js';

export const OrderStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_SUBMITTED: 'PAYMENT_SUBMITTED',
  PAYMENT_UNDER_REVIEW: 'PAYMENT_UNDER_REVIEW',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  PACKED: 'PACKED',
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
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['RETURN_REQUESTED'],
  CANCELLED: [],
  RETURN_REQUESTED: ['RETURNED', 'CANCELLED'],
  RETURNED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
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
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.RETURN_REQUESTED,
    OrderStatus.RETURNED,
    OrderStatus.REFUNDED,
  ].includes(status as never);
}
