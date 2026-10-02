import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  EmailNotificationAdapter,
  renderEmail,
} from './email-notification.adapter.js';

describe('Customer emails', () => {
  it('renders a readable order-created email with amount and reference', () => {
    const { subject, text } = renderEmail(
      {
        event: 'ORDER_CREATED',
        to: 'a@b.c',
        data: { orderNumber: 'ORD-2026-000001', grandTotalPence: 4899 },
      },
      'Thread N Form',
      'https://shop.example/',
    );
    expect(subject).toContain('ORD-2026-000001');
    expect(text).toContain('£48.99');
    expect(text).toContain('https://shop.example/orders/ORD-2026-000001');
    expect(text).not.toContain('{');
  });

  it('includes tracking details when shipped, and refund note when cancelled after payment', () => {
    expect(
      renderEmail(
        {
          event: 'ORDER_SHIPPED',
          to: 'a',
          data: { orderNumber: 'X', trackingNumber: 'RM1' },
        },
        'S',
        '',
      ).text,
    ).toContain('Tracking number: RM1');
    expect(
      renderEmail(
        {
          event: 'ORDER_CANCELLED',
          to: 'a',
          data: { orderNumber: 'X', refundRequired: true, reason: 'r' },
        },
        'S',
        '',
      ).text,
    ).toContain('refunded');
  });

  it('respects the admin "order emails enabled" switch', async () => {
    const settings = {
      get: vi.fn(async (key: string) =>
        key === 'notifications'
          ? { value: { orderEmailsEnabled: false } }
          : null,
      ),
    };
    const adapter = new EmailNotificationAdapter(
      { get: () => undefined } as unknown as ConfigService,
      settings as never,
    );
    const warn = vi.fn();
    (adapter as unknown as { logger: { warn: typeof warn } }).logger.warn =
      warn;
    await adapter.send({ event: 'ORDER_CREATED', to: 'a@b.c', data: {} });
    expect(warn).not.toHaveBeenCalled();
  });

  it('propagates failures so the outbox can retry', async () => {
    const adapter = new EmailNotificationAdapter(
      { get: () => undefined } as unknown as ConfigService,
      { get: vi.fn().mockRejectedValue(new Error('db down')) } as never,
    );
    await expect(
      adapter.send({ event: 'ORDER_CREATED', to: 'a@b.c', data: {} }),
    ).rejects.toThrow('db down');
  });

  it('renders the refund email with the amount', () => {
    expect(
      renderEmail(
        {
          event: 'REFUND_ISSUED',
          to: 'a',
          data: { orderNumber: 'X', amountPence: 1250 },
        },
        'S',
        '',
      ).subject,
    ).toContain('£12.50');
  });
});
