import { describe, expect, it } from 'vitest';
import { hasPermission, Permission } from './permissions.js';

describe('RBAC', () => {
  it('gives OWNER full access', () => {
    expect(hasPermission('OWNER', Permission.MANAGE_BANK_CONFIG)).toBe(true);
  });

  it('denies STAFF payment verify', () => {
    expect(hasPermission('STAFF', Permission.PAYMENT_VERIFY)).toBe(false);
  });

  it('allows ADMIN payment verify', () => {
    expect(hasPermission('ADMIN', Permission.PAYMENT_VERIFY)).toBe(true);
  });
});
