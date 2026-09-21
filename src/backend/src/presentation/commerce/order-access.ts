import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ValidationException } from '../../domain/exceptions/domain.exception.js';

/** Stable HMAC so guests can reopen their order page without exposing all ORD-* numbers. */
export function createOrderViewToken(
  orderNumber: string,
  email: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`order-view:${orderNumber}:${email.trim().toLowerCase()}`)
    .digest('hex');
}

export function getOrderViewSecret(config: ConfigService): string {
  return config.get<string>('cartTokenSecret') ?? 'dev';
}

export function assertSafeStoragePath(path: string, requiredPrefix: string) {
  const normalized = path.replace(/\\/g, '/').replace(/^\//, '');
  if (
    normalized.includes('..') ||
    normalized.includes('\0') ||
    !normalized.startsWith(requiredPrefix)
  ) {
    throw new ValidationException(
      'Invalid proof storage path',
      'INVALID_STORAGE_PATH',
    );
  }
  return normalized;
}
