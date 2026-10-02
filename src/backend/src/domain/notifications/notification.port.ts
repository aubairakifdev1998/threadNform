export type NotificationEvent =
  | 'ORDER_CREATED'
  | 'PAYMENT_PROOF_UPLOADED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_SHIPPED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'REFUND_ISSUED';

export type NotificationPayload = {
  event: NotificationEvent;
  to: string;
  data: Record<string, unknown>;
};

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

export interface NotificationPort {
  /** Delivers (or deliberately skips) the email; throws if delivery failed. */
  send(payload: NotificationPayload): Promise<void>;
}
