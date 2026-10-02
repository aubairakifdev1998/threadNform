import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type {
  NotificationPayload,
  NotificationPort,
} from '../../domain/notifications/notification.port.js';
import {
  PLATFORM_SETTINGS_REPOSITORY,
  type PlatformSettingsRepository,
} from '../../domain/repositories/platform-settings.repository.js';

const gbp = (pence: unknown) =>
  typeof pence === 'number' ? `£${(pence / 100).toFixed(2)}` : '';

/** Plain-text customer emails, one per event. */
export function renderEmail(
  payload: NotificationPayload,
  storeName: string,
  frontendUrl: string,
): { subject: string; text: string } {
  const d = payload.data;
  const order = String(d.orderNumber ?? '');
  const link = order ? `${frontendUrl.replace(/\/$/, '')}/orders/${order}` : '';
  const footer = `\n\nView your order: ${link}\n\n${storeName}`;
  switch (payload.event) {
    case 'ORDER_CREATED':
      return {
        subject: `Order ${order} received — payment needed`,
        text: `Thank you for your order ${order}.\n\nPlease transfer ${gbp(d.grandTotalPence)} by bank transfer using ${order} as the payment reference, then upload your proof of payment from your order page.${footer}`,
      };
    case 'PAYMENT_APPROVED':
      return {
        subject: `Payment confirmed for order ${order}`,
        text: `We have confirmed your payment for order ${order}. We are now preparing your items.${footer}`,
      };
    case 'PAYMENT_REJECTED':
      return {
        subject: `Action needed: payment for order ${order}`,
        text: `We could not confirm your payment for order ${order}.\n\nReason: ${String(d.reason ?? 'not specified')}\n\nPlease check the transfer and upload a new proof of payment.${footer}`,
      };
    case 'ORDER_SHIPPED':
      return {
        subject: `Order ${order} has shipped`,
        text: `Your order ${order} is on its way.${d.carrier ? `\nCarrier: ${String(d.carrier)}` : ''}${d.trackingNumber ? `\nTracking number: ${String(d.trackingNumber)}` : ''}${d.trackingUrl ? `\nTrack it: ${String(d.trackingUrl)}` : ''}${footer}`,
      };
    case 'ORDER_DELIVERED':
      return {
        subject: `Order ${order} delivered`,
        text: `Your order ${order} has been delivered. We hope you love it.${footer}`,
      };
    case 'REFUND_ISSUED':
      return {
        subject: `Refund of ${gbp(d.amountPence)} for order ${order}`,
        text: `We have refunded ${gbp(d.amountPence)} for order ${order} to the account you paid from. Bank transfers can take a few working days to appear.${d.reason ? `\n\nReason: ${String(d.reason)}` : ''}${footer}`,
      };
    case 'ORDER_CANCELLED':
      return {
        subject: `Order ${order} cancelled`,
        text: `Your order ${order} has been cancelled.\n\nReason: ${String(d.reason ?? 'not specified')}${d.refundRequired ? '\n\nYour payment will be refunded to the account it came from.' : ''}${footer}`,
      };
    default:
      return {
        subject: `Update on order ${order}`,
        text: `There is an update on your order ${order}.${footer}`,
      };
  }
}

/**
 * Email adapter. When SMTP_* env vars are set, sends mail.
 * Otherwise logs (safe default for local/dev).
 */
@Injectable()
export class EmailNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(EmailNotificationAdapter.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(PLATFORM_SETTINGS_REPOSITORY)
    private readonly settings: PlatformSettingsRepository,
  ) {}

  /** Throws on delivery failure so the outbox can retry. */
  async send(payload: NotificationPayload): Promise<void> {
    const [notifications, storefront] = await Promise.all([
      this.settings.get('notifications'),
      this.settings.get('storefront'),
    ]);
    if (notifications?.value.orderEmailsEnabled === false) return;

    const storeName = String(storefront?.value.storeName ?? 'Thread N Form');
    const { subject, text } = renderEmail(
      payload,
      storeName,
      this.config.get<string>('frontendUrl') ?? '',
    );

    const host = this.config.get<string>('smtp.host');
    const user = this.config.get<string>('smtp.user');
    const pass = this.config.get<string>('smtp.pass');
    const from = this.config.get<string>('smtp.from') ?? 'noreply@fareya.local';

    if (!host || !user || !pass) {
      this.logger.warn(
        `SMTP not configured — email not delivered: ${payload.event} → ${payload.to}: ${subject}`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('smtp.port') ?? 587,
      secure: this.config.get<boolean>('smtp.secure') ?? false,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transporter.sendMail({ from, to: payload.to, subject, text });
  }
}
