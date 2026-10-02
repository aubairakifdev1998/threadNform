import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type {
  NotificationEvent,
  NotificationPayload,
} from '../../../domain/notifications/notification.port.js';
import type {
  NotificationOutboxRepository,
  OutboxMessage,
} from '../../../domain/repositories/notification-outbox.repository.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import { notificationOutbox } from '../../drizzle/schema/index.js';

@Injectable()
export class SupabaseNotificationOutboxRepository implements NotificationOutboxRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async enqueue(payload: NotificationPayload): Promise<string> {
    const [row] = await this.db
      .insert(notificationOutbox)
      .values({
        event: payload.event,
        recipient: payload.to,
        payload: payload.data,
      })
      .returning({ id: notificationOutbox.id });
    return row.id;
  }

  async claim(id: string, leaseSeconds: number): Promise<OutboxMessage | null> {
    const [row] = await this.db
      .update(notificationOutbox)
      .set({
        attempts: sql`${notificationOutbox.attempts} + 1`,
        nextAttemptAt: sql`now() + make_interval(secs => ${leaseSeconds})`,
      })
      .where(
        and(
          eq(notificationOutbox.id, id),
          eq(notificationOutbox.status, 'PENDING'),
          lte(notificationOutbox.nextAttemptAt, sql`now()`),
        ),
      )
      .returning();
    if (!row) return null;
    return {
      id: row.id,
      event: row.event as NotificationEvent,
      to: row.recipient,
      data: (row.payload as Record<string, unknown>) ?? {},
      attempts: row.attempts,
    };
  }

  async listDueIds(limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.status, 'PENDING'),
          lte(notificationOutbox.nextAttemptAt, sql`now()`),
        ),
      )
      .orderBy(asc(notificationOutbox.nextAttemptAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async markSent(id: string): Promise<void> {
    await this.db
      .update(notificationOutbox)
      .set({ status: 'SENT', sentAt: new Date(), lastError: null })
      .where(eq(notificationOutbox.id, id));
  }

  async markFailed(
    id: string,
    error: string,
    retryAt: Date | null,
  ): Promise<void> {
    await this.db
      .update(notificationOutbox)
      .set(
        retryAt
          ? { lastError: error.slice(0, 1000), nextAttemptAt: retryAt }
          : { lastError: error.slice(0, 1000), status: 'FAILED' },
      )
      .where(eq(notificationOutbox.id, id));
  }
}
