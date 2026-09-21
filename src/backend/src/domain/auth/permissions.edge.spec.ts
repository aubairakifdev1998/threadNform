import { describe, expect, it } from 'vitest';
import { hasPermission, Permission, ROLE_PERMISSIONS } from './permissions.js';

describe('Admin permissions — edge cases', () => {
  it('OWNER has every permission', () => {
    for (const permission of Object.values(Permission)) {
      expect(hasPermission('OWNER', permission)).toBe(true);
    }
  });

  it('STAFF cannot verify payments or manage admins', () => {
    expect(hasPermission('STAFF', Permission.PAYMENT_VERIFY)).toBe(false);
    expect(hasPermission('STAFF', Permission.MANAGE_ADMINS)).toBe(false);
    expect(hasPermission('STAFF', Permission.CATALOG_WRITE)).toBe(false);
  });

  it('ADMIN can verify payments but not manage admins or bank config', () => {
    expect(hasPermission('ADMIN', Permission.PAYMENT_VERIFY)).toBe(true);
    expect(hasPermission('ADMIN', Permission.MANAGE_ADMINS)).toBe(false);
    expect(hasPermission('ADMIN', Permission.MANAGE_BANK_CONFIG)).toBe(false);
  });

  it('role permission sets are non-empty and unique', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      expect(perms.length, role).toBeGreaterThan(0);
      expect(new Set(perms).size).toBe(perms.length);
    }
  });
});
