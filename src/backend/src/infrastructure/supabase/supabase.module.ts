import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NOTIFICATION_PORT } from '../../domain/notifications/notification.port.js';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.js';
import { AUTH_REPOSITORY } from '../../domain/repositories/auth.repository.js';
import { CART_REPOSITORY } from '../../domain/repositories/cart.repository.js';
import { CATALOG_REPOSITORY } from '../../domain/repositories/catalog.repository.js';
import { COMMERCE_REPOSITORY } from '../../domain/repositories/commerce.repository.js';
import { CUSTOMER_ADDRESS_REPOSITORY } from '../../domain/repositories/customer-address.repository.js';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.js';
import { INVENTORY_REPOSITORY } from '../../domain/repositories/inventory.repository.js';
import { PRODUCT_REPOSITORY } from '../../domain/repositories/product.repository.js';
import { SITE_CONTENT_REPOSITORY } from '../../domain/repositories/site-content.repository.js';
import { STORAGE_REPOSITORY } from '../../domain/repositories/storage.repository.js';
import { PLATFORM_SETTINGS_REPOSITORY } from '../../domain/repositories/platform-settings.repository.js';
import { EmailNotificationAdapter } from '../notifications/email-notification.adapter.js';
import { SupabaseAuthRepository } from './auth/supabase-auth.repository.js';
import { SupabaseAdminUserRepository } from './database/supabase-admin-user.repository.js';
import { SupabaseCartRepository } from './database/supabase-cart.repository.js';
import { SupabaseCatalogRepository } from './database/supabase-catalog.repository.js';
import { SupabaseCommerceRepository } from './database/supabase-commerce.repository.js';
import { SupabaseCustomerAddressRepository } from './database/supabase-customer-address.repository.js';
import { SupabaseCustomerRepository } from './database/supabase-customer.repository.js';
import { SupabaseInventoryRepository } from './database/supabase-inventory.repository.js';
import { SupabasePlatformSettingsRepository } from './database/supabase-platform-settings.repository.js';
import { SupabaseProductRepository } from './database/supabase-product.repository.js';
import { SupabaseSiteContentRepository } from './database/supabase-site-content.repository.js';
import { SupabaseStorageRepository } from './storage/supabase-storage.repository.js';
import {
  SUPABASE_ADMIN_CLIENT,
  SUPABASE_CLIENT,
} from './supabase.tokens.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SUPABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SupabaseClient =>
        createClient(
          config.getOrThrow<string>('supabase.url'),
          config.getOrThrow<string>('supabase.anonKey'),
          { auth: { autoRefreshToken: false, persistSession: false } },
        ),
    },
    {
      provide: SUPABASE_ADMIN_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SupabaseClient =>
        createClient(
          config.getOrThrow<string>('supabase.url'),
          config.getOrThrow<string>('supabase.serviceRoleKey'),
          { auth: { autoRefreshToken: false, persistSession: false } },
        ),
    },
    { provide: AUTH_REPOSITORY, useClass: SupabaseAuthRepository },
    { provide: PRODUCT_REPOSITORY, useClass: SupabaseProductRepository },
    { provide: STORAGE_REPOSITORY, useClass: SupabaseStorageRepository },
    { provide: ADMIN_USER_REPOSITORY, useClass: SupabaseAdminUserRepository },
    { provide: CUSTOMER_REPOSITORY, useClass: SupabaseCustomerRepository },
    {
      provide: CUSTOMER_ADDRESS_REPOSITORY,
      useClass: SupabaseCustomerAddressRepository,
    },
    { provide: CATALOG_REPOSITORY, useClass: SupabaseCatalogRepository },
    { provide: INVENTORY_REPOSITORY, useClass: SupabaseInventoryRepository },
    { provide: CART_REPOSITORY, useClass: SupabaseCartRepository },
    { provide: COMMERCE_REPOSITORY, useClass: SupabaseCommerceRepository },
    {
      provide: SITE_CONTENT_REPOSITORY,
      useClass: SupabaseSiteContentRepository,
    },
    {
      provide: PLATFORM_SETTINGS_REPOSITORY,
      useClass: SupabasePlatformSettingsRepository,
    },
    { provide: NOTIFICATION_PORT, useClass: EmailNotificationAdapter },
  ],
  exports: [
    SUPABASE_CLIENT,
    SUPABASE_ADMIN_CLIENT,
    AUTH_REPOSITORY,
    PRODUCT_REPOSITORY,
    STORAGE_REPOSITORY,
    ADMIN_USER_REPOSITORY,
    CUSTOMER_REPOSITORY,
    CUSTOMER_ADDRESS_REPOSITORY,
    CATALOG_REPOSITORY,
    INVENTORY_REPOSITORY,
    CART_REPOSITORY,
    COMMERCE_REPOSITORY,
    SITE_CONTENT_REPOSITORY,
    PLATFORM_SETTINGS_REPOSITORY,
    NOTIFICATION_PORT,
  ],
})
export class SupabaseModule {}
