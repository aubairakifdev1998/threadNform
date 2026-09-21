import { Inject, Injectable, Logger } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type {
  PlatformSetting,
  PlatformSettingsRepository,
} from '../../../domain/repositories/platform-settings.repository.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import { platformSettings } from '../../drizzle/schema/index.js';

const DEFAULTS: Record<
  string,
  { value: Record<string, unknown>; description: string }
> = {
  storefront: {
    description: 'Public storefront identity and maintenance flag',
    value: {
      storeName: 'Thread N Form',
      tagline: 'UK fashion made simple',
      supportEmail: 'support@threadnform.example',
      supportPhone: '',
      currency: 'GBP',
      maintenanceMode: false,
      showOutOfStock: true,
    },
  },
  checkout: {
    description: 'Checkout behaviour',
    value: {
      guestCheckoutEnabled: true,
      requirePhone: false,
      minOrderPence: 0,
      allowNotes: true,
    },
  },
  inventory: {
    description: 'Stock reservation and low-stock alerts',
    value: {
      reserveOnCart: true,
      allowOversell: false,
      lowStockThreshold: 5,
      defaultWarehouseCode: 'UK-MAIN',
    },
  },
  payments: {
    description: 'Payment and bank-transfer rules',
    value: {
      manualBankTransferEnabled: true,
      proofRequired: true,
      autoExpirePendingHours: 72,
      instructions:
        'Transfer the exact order total and upload proof of payment.',
    },
  },
  notifications: {
    description: 'Email and alert preferences',
    value: {
      orderEmailsEnabled: true,
      adminAlertEmail: '',
      lowStockAlertsEnabled: true,
    },
  },
  security: {
    description: 'Account and access controls',
    value: {
      blockNewRegistrations: false,
      requireEmailConfirmation: true,
      sessionIdleMinutes: 10080,
    },
  },
};

@Injectable()
export class SupabasePlatformSettingsRepository
  implements PlatformSettingsRepository
{
  private readonly logger = new Logger(SupabasePlatformSettingsRepository.name);
  private tableMissing = false;
  private memory = new Map<string, PlatformSetting>();

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {
    for (const [key, def] of Object.entries(DEFAULTS)) {
      this.memory.set(key, {
        key,
        value: { ...def.value },
        description: def.description,
        updatedAt: new Date(),
        updatedBy: null,
      });
    }
  }

  async list(): Promise<PlatformSetting[]> {
    if (this.tableMissing) return [...this.memory.values()];
    try {
      const data = await this.db
        .select()
        .from(platformSettings)
        .orderBy(asc(platformSettings.key));
      if (!data.length) return [...this.memory.values()];
      return data.map((row) => this.map(row));
    } catch (error) {
      this.markMissing(error);
      return [...this.memory.values()];
    }
  }

  async get(key: string): Promise<PlatformSetting | null> {
    if (this.tableMissing) return this.memory.get(key) ?? null;
    try {
      const [row] = await this.db
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.key, key))
        .limit(1);
      return row ? this.map(row) : (this.memory.get(key) ?? null);
    } catch (error) {
      this.markMissing(error);
      return this.memory.get(key) ?? null;
    }
  }

  async upsert(
    key: string,
    value: Record<string, unknown>,
    updatedBy?: string | null,
    description?: string | null,
  ): Promise<PlatformSetting> {
    if (this.tableMissing) {
      const next: PlatformSetting = {
        key,
        value,
        description:
          description ??
          this.memory.get(key)?.description ??
          DEFAULTS[key]?.description ??
          null,
        updatedAt: new Date(),
        updatedBy: updatedBy ?? null,
      };
      this.memory.set(key, next);
      return next;
    }

    try {
      const [row] = await this.db
        .insert(platformSettings)
        .values({
          key,
          value,
          description:
            description ??
            this.memory.get(key)?.description ??
            DEFAULTS[key]?.description ??
            null,
          updatedAt: new Date(),
          updatedBy: updatedBy ?? null,
        })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: {
            value,
            ...(description !== undefined ? { description } : {}),
            updatedAt: new Date(),
            updatedBy: updatedBy ?? null,
          },
        })
        .returning();
      return this.map(row);
    } catch (error) {
      this.markMissing(error);
      const next: PlatformSetting = {
        key,
        value,
        description:
          description ??
          this.memory.get(key)?.description ??
          DEFAULTS[key]?.description ??
          null,
        updatedAt: new Date(),
        updatedBy: updatedBy ?? null,
      };
      this.memory.set(key, next);
      return next;
    }
  }

  async getInventoryPolicy(): Promise<{
    reserveOnCart: boolean;
    allowOversell: boolean;
    lowStockThreshold: number;
  }> {
    const row = await this.get('inventory');
    const value = row?.value ?? DEFAULTS.inventory.value;
    return {
      reserveOnCart: value.reserveOnCart !== false,
      allowOversell: value.allowOversell === true,
      lowStockThreshold: Number(value.lowStockThreshold ?? 5),
    };
  }

  private markMissing(error: unknown) {
    const msg = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    if (
      msg.includes('platform_settings') ||
      msg.includes('does not exist') ||
      msg.includes('relation')
    ) {
      if (!this.tableMissing) {
        this.logger.warn(
          'platform_settings table missing — using in-memory defaults. Run supabase/migrations/009_platform_admin.sql',
        );
      }
      this.tableMissing = true;
    } else {
      throw error;
    }
  }

  private map(row: typeof platformSettings.$inferSelect): PlatformSetting {
    return {
      key: row.key,
      value: (row.value as Record<string, unknown>) ?? {},
      description: row.description ?? null,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy ?? null,
    };
  }
}
