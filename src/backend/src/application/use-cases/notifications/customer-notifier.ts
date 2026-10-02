import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_PORT,
  type NotificationPayload,
  type NotificationPort,
} from '../../../domain/notifications/notification.port.js';
import {
  NOTIFICATION_OUTBOX_REPOSITORY,
  type NotificationOutboxRepository,
} from '../../../domain/repositories/notification-outbox.repository.js';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../domain/repositories/unit-of-work.js';

const MAX_ATTEMPTS = 6;
const LEASE_SECONDS = 120;

/**
 * Transactional outbox for customer emails. `notify` writes the message in
 * the caller's transaction (so it exists iff the change committed) and tries
 * to deliver it right after commit; anything undelivered is retried by
 * `dispatchDue` from the cron with exponential backoff.
 */
@Injectable()
export class CustomerNotifier {
  private readonly logger = new Logger(CustomerNotifier.name);

  constructor(
    @Inject(NOTIFICATION_OUTBOX_REPOSITORY)
    private readonly outbox: NotificationOutboxRepository,
    @Inject(NOTIFICATION_PORT) private readonly port: NotificationPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async notify(payload: NotificationPayload): Promise<void> {
    const id = await this.outbox.enqueue(payload);
    this.uow.afterCommit(async () => {
      await this.deliver(id);
    });
  }

  async dispatchDue(limit = 50): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const id of await this.outbox.listDueIds(limit)) {
      if (await this.deliver(id)) sent += 1;
      else failed += 1;
    }
    return { sent, failed };
  }

  /** One delivery attempt; true when the message was sent by this call. */
  async deliver(id: string): Promise<boolean> {
    const message = await this.outbox.claim(id, LEASE_SECONDS);
    if (!message) return false;
    try {
      await this.port.send(message);
      await this.outbox.markSent(id);
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const retryAt =
        message.attempts >= MAX_ATTEMPTS
          ? null
          : new Date(Date.now() + 2 ** message.attempts * 60_000);
      await this.outbox.markFailed(id, reason, retryAt);
      this.logger.warn(
        `Email ${message.event} to ${message.to} failed (attempt ${message.attempts}): ${reason}`,
      );
      return false;
    }
  }
}
