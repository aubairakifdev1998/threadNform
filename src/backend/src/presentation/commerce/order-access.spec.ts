import { describe, expect, it } from 'vitest';
import {
  assertAllowedFrontendRedirect,
  assertSafeStorageFolder,
  assertSafeStoragePath,
  createOrderViewToken,
} from './order-access.js';

describe('order-access helpers', () => {
  it('createOrderViewToken is stable for the same inputs', () => {
    const a = createOrderViewToken('ORD-1', 'A@B.com', 'secret');
    const b = createOrderViewToken('ORD-1', 'a@b.com', 'secret');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('assertSafeStoragePath rejects traversal and wrong prefix', () => {
    expect(assertSafeStoragePath('orders/ORD-1/p.png', 'orders/')).toBe(
      'orders/ORD-1/p.png',
    );
    expect(() =>
      assertSafeStoragePath('orders/../etc/passwd', 'orders/'),
    ).toThrow();
    expect(() =>
      assertSafeStoragePath('products/x.png', 'orders/'),
    ).toThrow();
  });

  it('assertSafeStorageFolder rejects .. and null bytes', () => {
    expect(assertSafeStorageFolder('products/tees')).toBe('products/tees');
    expect(assertSafeStorageFolder(undefined)).toBeUndefined();
    expect(() => assertSafeStorageFolder('../secret')).toThrow();
    expect(() => assertSafeStorageFolder('a/\0/b')).toThrow();
  });

  it('assertAllowedFrontendRedirect allowlists frontend origin only', () => {
    const fe = 'http://localhost:3001';
    expect(assertAllowedFrontendRedirect(undefined, fe)).toBe(
      'http://localhost:3001/auth/callback',
    );
    expect(
      assertAllowedFrontendRedirect('http://localhost:3001/auth/callback', fe),
    ).toBe('http://localhost:3001/auth/callback');
    expect(() =>
      assertAllowedFrontendRedirect('https://evil.example/phish', fe),
    ).toThrow();
  });
});
