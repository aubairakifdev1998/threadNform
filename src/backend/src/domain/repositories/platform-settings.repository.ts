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

export const PLATFORM_SETTINGS_REPOSITORY = Symbol('PLATFORM_SETTINGS_REPOSITORY');

export interface PlatformSettingsRepository {
  list(): Promise<PlatformSetting[]>;
  get(key: string): Promise<PlatformSetting | null>;
  upsert(
    key: string,
    value: Record<string, unknown>,
    updatedBy?: string | null,
    description?: string | null,
  ): Promise<PlatformSetting>;
  getInventoryPolicy(): Promise<{
    reserveOnCart: boolean;
    allowOversell: boolean;
    lowStockThreshold: number;
  }>;
}
