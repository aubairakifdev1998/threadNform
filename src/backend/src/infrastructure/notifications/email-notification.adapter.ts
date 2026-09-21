import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type {
  NotificationPayload,
  NotificationPort,
} from '../../domain/notifications/notification.port.js';

/**
 * Email adapter. When SMTP_* env vars are set, sends mail.
 * Otherwise logs (safe default for local/dev).
 */
@Injectable()
export class EmailNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(EmailNotificationAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async send(payload: NotificationPayload): Promise<void> {
    const subject = `[Fareya] ${payload.event.replace(/_/g, ' ')}`;
    const text = `${payload.event}\n\n${JSON.stringify(payload.data, null, 2)}`;

    const host = this.config.get<string>('smtp.host');
    const user = this.config.get<string>('smtp.user');
    const pass = this.config.get<string>('smtp.pass');
    const from =
      this.config.get<string>('smtp.from') ?? 'noreply@fareya.local';

    if (!host || !user || !pass) {
      this.logger.log(
        `Email stub ${payload.event} → ${payload.to}: ${JSON.stringify(payload.data)}`,
      );
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('smtp.port') ?? 587,
        secure: this.config.get<boolean>('smtp.secure') ?? false,
        auth: { user, pass },
      });
      await transporter.sendMail({
        from,
        to: payload.to,
        subject,
        text,
      });
    } catch (err) {
      // Never fail commerce because notification failed
      this.logger.error(
        `Failed to send ${payload.event} to ${payload.to}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
