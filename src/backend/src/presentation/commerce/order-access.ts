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

/** Reject path traversal / null bytes; optional prefix when the bucket layout is fixed. */
export function assertSafeStorageFolder(
  folder: string | undefined | null,
  options: { requiredPrefix?: string } = {},
): string | undefined {
  if (folder == null || folder === '') return undefined;
  const normalized = folder
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!normalized || normalized.includes('..') || normalized.includes('\0')) {
    throw new ValidationException(
      'Invalid storage folder',
      'INVALID_STORAGE_FOLDER',
    );
  }
  if (
    options.requiredPrefix &&
    !normalized.startsWith(options.requiredPrefix.replace(/\/$/, ''))
  ) {
    throw new ValidationException(
      'Invalid storage folder',
      'INVALID_STORAGE_FOLDER',
    );
  }
  return normalized;
}

/** Only allow redirects back to the configured storefront origin. */
export function assertAllowedFrontendRedirect(
  redirectTo: string | undefined | null,
  frontendUrl: string,
): string {
  const fallback = `${frontendUrl.replace(/\/$/, '')}/auth/callback`;
  if (!redirectTo?.trim()) return fallback;
  let target: URL;
  let allowed: URL;
  try {
    target = new URL(redirectTo);
    allowed = new URL(frontendUrl);
  } catch {
    throw new ValidationException(
      'Redirect URL is not allowed',
      'INVALID_REDIRECT',
    );
  }
  if (target.origin !== allowed.origin) {
    throw new ValidationException(
      'Redirect URL is not allowed',
      'INVALID_REDIRECT',
    );
  }
  return target.toString();
}
