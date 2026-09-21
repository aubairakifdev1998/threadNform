export type AdminRole = 'OWNER' | 'ADMIN' | 'STAFF';

export const Permission = {
  MANAGE_ADMINS: 'MANAGE_ADMINS',
  MANAGE_BANK_CONFIG: 'MANAGE_BANK_CONFIG',
  CATALOG_WRITE: 'CATALOG_WRITE',
  CATALOG_READ: 'CATALOG_READ',
  PRICE_EDIT: 'PRICE_EDIT',
  INVENTORY_ADJUST: 'INVENTORY_ADJUST',
  ORDERS_READ: 'ORDERS_READ',
  ORDERS_STATUS: 'ORDERS_STATUS',
  PAYMENT_VERIFY: 'PAYMENT_VERIFY',
  ORDER_CANCEL: 'ORDER_CANCEL',
  CUSTOMERS_BLOCK: 'CUSTOMERS_BLOCK',
  AUDIT_READ: 'AUDIT_READ',
  REPORTING_READ: 'REPORTING_READ',
  RETURNS_APPROVE: 'RETURNS_APPROVE',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL = Object.values(Permission);

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: [
    Permission.MANAGE_BANK_CONFIG,
    Permission.CATALOG_WRITE,
    Permission.CATALOG_READ,
    Permission.PRICE_EDIT,
    Permission.INVENTORY_ADJUST,
    Permission.ORDERS_READ,
    Permission.ORDERS_STATUS,
    Permission.PAYMENT_VERIFY,
    Permission.ORDER_CANCEL,
    Permission.CUSTOMERS_BLOCK,
    Permission.AUDIT_READ,
    Permission.REPORTING_READ,
    Permission.RETURNS_APPROVE,
  ],
  STAFF: [
    Permission.CATALOG_READ,
    Permission.INVENTORY_ADJUST,
    Permission.ORDERS_READ,
    Permission.ORDERS_STATUS,
    Permission.REPORTING_READ,
  ],
};

export function hasPermission(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
