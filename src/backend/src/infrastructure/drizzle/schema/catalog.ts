import {
  bigint,
  boolean,
  char,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  attributeRoleEnum,
  mediaTypeEnum,
  productStatusEnum,
  productTypeEnum,
} from './enums.js';

export const vatRates = pgTable('vat_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  rateBps: integer('rate_bps').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  effectiveFrom: timestamp('effective_from', { withTimezone: true })
    .notNull()
    .defaultNow(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  departmentId: uuid('department_id')
    .notNull()
    .references(() => departments.id),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoPath: text('logo_path'),
  description: text('description'),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attributes = pgTable('attributes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  inputType: text('input_type').notNull().default('SELECT'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attributeOptions = pgTable(
  'attribute_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [unique().on(t.attributeId, t.value)],
);

export const colors = pgTable('colors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  nameNormalized: text('name_normalized').notNull().unique(),
  hex: text('hex'),
  swatchPath: text('swatch_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sizeSystems = pgTable('size_systems', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sizeSystemValues = pgTable(
  'size_system_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sizeSystemId: uuid('size_system_id')
      .notNull()
      .references(() => sizeSystems.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [unique().on(t.sizeSystemId, t.code)],
);

export const sizeCharts = pgTable('size_charts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  scopeType: text('scope_type').notNull(),
  scopeId: uuid('scope_id').notNull(),
  sizeSystemId: uuid('size_system_id').references(() => sizeSystems.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sizeChartRows = pgTable('size_chart_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  sizeChartId: uuid('size_chart_id')
    .notNull()
    .references(() => sizeCharts.id, { onDelete: 'cascade' }),
  sizeLabel: text('size_label').notNull(),
  measurements: jsonb('measurements').notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  shortDescription: text('short_description'),
  productType: productTypeEnum('product_type').notNull().default('SIMPLE'),
  departmentId: uuid('department_id').references(() => departments.id),
  categoryId: uuid('category_id').references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => categories.id),
  brandId: uuid('brand_id').references(() => brands.id),
  status: productStatusEnum('status').notNull().default('DRAFT'),
  seo: jsonb('seo').notNull().default({}),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productCollections = pgTable(
  'product_collections',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.productId, t.collectionId)],
);

export const productAttributes = pgTable(
  'product_attributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id),
    role: attributeRoleEnum('role').notNull().default('INFORMATIONAL'),
  },
  (t) => [unique().on(t.productId, t.attributeId)],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull().unique(),
    status: productStatusEnum('status').notNull().default('ACTIVE'),
    barcode: text('barcode'),
    optionFingerprint: text('option_fingerprint').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.productId, t.optionFingerprint)],
);

export const productVariantOptions = pgTable(
  'product_variant_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id),
    optionId: uuid('option_id').references(() => attributeOptions.id),
    colorId: uuid('color_id').references(() => colors.id),
    sizeValueId: uuid('size_value_id').references(() => sizeSystemValues.id),
    valueText: text('value_text'),
  },
  (t) => [unique().on(t.variantId, t.attributeId)],
);

export const productPrices = pgTable('product_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').references(() => productVariants.id, {
    onDelete: 'cascade',
  }),
  currency: char('currency', { length: 3 }).notNull().default('GBP'),
  basePricePence: bigint('base_price_pence', { mode: 'number' }).notNull(),
  salePricePence: bigint('sale_price_pence', { mode: 'number' }),
  compareAtPence: bigint('compare_at_pence', { mode: 'number' }),
  costPence: bigint('cost_pence', { mode: 'number' }),
  vatRateId: uuid('vat_rate_id')
    .notNull()
    .references(() => vatRates.id),
  vatInclusive: boolean('vat_inclusive').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productMedia = pgTable('product_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').references(() => productVariants.id, {
    onDelete: 'set null',
  }),
  type: mediaTypeEnum('type').notNull().default('IMAGE'),
  storagePath: text('storage_path').notNull(),
  altText: text('alt_text'),
  sortOrder: integer('sort_order').notNull().default(0),
  isPrimary: boolean('is_primary').notNull().default(false),
  metadata: jsonb('metadata').notNull().default({}),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
