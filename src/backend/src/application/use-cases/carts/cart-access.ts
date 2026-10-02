import { createHash, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '../../../domain/exceptions/domain.exception.js';
import type { Cart } from '../../../domain/repositories/cart.repository.js';

/** Upper bound for one cart line; guards against fat-finger and overflow. */
export const MAX_CART_LINE_QUANTITY = 99;

export function cartTokenSecret(config: ConfigService): string {
  return config.get<string>('cartTokenSecret') ?? 'dev-cart-secret-change-me';
}

export function hashGuestToken(token: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${token}`).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Who may use a cart:
 * - guest carts: whoever holds the guest token (signed in or not);
 * - customer carts: only that signed-in customer.
 * Unauthorised callers get NOT_FOUND so cart ids cannot be probed.
 */
export function assertCartAccess(
  cart: Cart,
  caller: { customerId?: string | null; guestToken?: string | null },
  secret: string,
): void {
  if (cart.customerId) {
    if (caller.customerId && caller.customerId === cart.customerId) return;
    if (caller.customerId) {
      throw new ForbiddenException(
        'This cart belongs to another account',
        'CART_FORBIDDEN',
      );
    }
    throw new ValidationException(
      'Sign in to use this cart',
      'CART_REQUIRES_AUTH',
    );
  }
  if (!cart.guestTokenHash) {
    throw new NotFoundException('Cart', cart.id);
  }
  if (!caller.guestToken) {
    throw new ValidationException(
      'Guest token required',
      'GUEST_TOKEN_REQUIRED',
    );
  }
  if (
    !sameHash(hashGuestToken(caller.guestToken, secret), cart.guestTokenHash)
  ) {
    throw new NotFoundException('Cart', cart.id);
  }
}
