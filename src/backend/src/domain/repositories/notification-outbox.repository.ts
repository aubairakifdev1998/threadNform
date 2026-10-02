import type { NotificationPayload } from '../notifications/notification.port.js';

export const NOTIFICATION_OUTBOX_REPOSITORY = Symbol(
  'NOTIFICATION_OUTBOX_REPOSITORY',
);

export type OutboxMessage = NotificationPayload & {
  id: string;
  attempts: number;
};

export interface NotificationOutboxRepository {
  /** Stores a message in the current transaction; returns its id. */
  enqueue(payload: NotificationPayload): Promise<string>;
  /**
   * Leases a due PENDING message for one delivery attempt (bumps attempts and
   * pushes next_attempt_at out), or returns null if it is not due / taken.
   */
  claim(id: string, leaseSeconds: number): Promise<OutboxMessage | null>;
  listDueIds(limit: number): Promise<string[]>;
  markSent(id: string): Promise<void>;
  /** Records a failure; `retryAt` null marks it permanently FAILED. */
  markFailed(id: string, error: string, retryAt: Date | null): Promise<void>;
}
