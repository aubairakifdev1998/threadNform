import { Injectable, Logger } from '@nestjs/common';
import type {
  NotificationPayload,
  NotificationPort,
} from '../../domain/notifications/notification.port.js';

/** V1 stub — logs only; swap for email/SMS providers later without changing domain. */
@Injectable()
export class LoggingNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(LoggingNotificationAdapter.name);

  async send(payload: NotificationPayload): Promise<void> {
    this.logger.log(
      `Notification ${payload.event} → ${payload.to} ${JSON.stringify(payload.data)}`,
    );
  }
}
