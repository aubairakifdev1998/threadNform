export type PlatformSettingKey =
  | 'storefront'
  | 'checkout'
  | 'inventory'
  | 'payments'
  | 'notifications'
  | 'security';

export type PlatformSetting = {
  key: PlatformSettingKey | string;
  value: Record<string, unknown>;
  description: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};

export const PLATFORM_SETTINGS_REPOSITORY = Symbol(
  'PLATFORM_SETTINGS_REPOSITORY',
);

export interface PlatformSettingsRepository {
  list(): Promise<PlatformSetting[]>;
  get(key: string): Promise<PlatformSetting | null>;
  upsert(
    key: string,
    value: Record<string, unknown>,
    updatedBy?: string | null,
    description?: string | null,
  ): Promise<PlatformSetting>;
  getInventoryPolicy(): Promise<InventoryPolicy>;
  getCommercePolicy(): Promise<CommercePolicy>;
  /** Built-in default values, used to validate admin edits. */
  getDefaults(key: string): Record<string, unknown> | null;
}

export type InventoryPolicy = {
  reserveOnCart: boolean;
  allowOversell: boolean;
  lowStockThreshold: number;
  /** Minutes of cart inactivity after which its stock hold is released. */
  cartHoldMinutes: number;
};

export type CommercePolicy = {
  maintenanceMode: boolean;
  guestCheckoutEnabled: boolean;
  requirePhone: boolean;
  minOrderPence: number;
  allowNotes: boolean;
  manualBankTransferEnabled: boolean;
  /** Hours an unpaid order (no proof uploaded) stays open before auto-cancel. */
  autoExpirePendingHours: number;
  blockNewRegistrations: boolean;
};
