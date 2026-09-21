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
  addressTypeEnum,
  actorTypeEnum,
  cartStatusEnum,
  orderStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  proofStatusEnum,
  returnStatusEnum,
  shippingStatusEnum,
  timelineVisibilityEnum,
} from './enums.js';
import { customers, adminUsers } from './identity.js';
import { products, productVariants, vatRates } from './catalog.js';

export const customerAddresses = pgTable('customer_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  line1: text('line1').notNull(),
  line2: text('line2'),
  city: text('city').notNull(),
  county: text('county'),
  postcode: text('postcode').notNull(),
  postcodeNormalized: text('postcode_normalized').notNull(),
  country: char('country', { length: 2 }).notNull().default('GB'),
  phone: text('phone'),
  isDefaultShipping: boolean('is_default_shipping').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const carts = pgTable('carts', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').references(() => customers.id, {
    onDelete: 'cascade',
  }),
  guestTokenHash: text('guest_token_hash').unique(),
  status: cartStatusEnum('status').notNull().default('ACTIVE'),
  currency: char('currency', { length: 3 }).notNull().default('GBP'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.cartId, t.variantId)],
);

export const shippingMethods = pgTable('shipping_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  pricePence: bigint('price_pence', { mode: 'number' }).notNull(),
  vatRateId: uuid('vat_rate_id')
    .notNull()
    .references(() => vatRates.id),
  etaMinDays: integer('eta_min_days').notNull().default(2),
  etaMaxDays: integer('eta_max_days').notNull().default(5),
  isActive: boolean('is_active').notNull().default(true),
  eligibleCountries: text('eligible_countries').array().notNull().default(['GB']),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: text('order_number').notNull().unique(),
  customerId: uuid('customer_id').references(() => customers.id),
  email: text('email').notNull(),
  phone: text('phone'),
  status: orderStatusEnum('status').notNull().default('PENDING_PAYMENT'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('PENDING'),
  shippingStatus: shippingStatusEnum('shipping_status')
    .notNull()
    .default('NOT_SHIPPED'),
  currency: char('currency', { length: 3 }).notNull().default('GBP'),
  subtotalPence: bigint('subtotal_pence', { mode: 'number' }).notNull(),
  discountPence: bigint('discount_pence', { mode: 'number' }).notNull().default(0),
  netPence: bigint('net_pence', { mode: 'number' }).notNull(),
  vatPence: bigint('vat_pence', { mode: 'number' }).notNull(),
  shippingPence: bigint('shipping_pence', { mode: 'number' }).notNull(),
  grandTotalPence: bigint('grand_total_pence', { mode: 'number' }).notNull(),
  shippingMethodSnapshot: jsonb('shipping_method_snapshot').notNull().default({}),
  vatSnapshot: jsonb('vat_snapshot').notNull().default({}),
  carrier: text('carrier'),
  trackingNumber: text('tracking_number'),
  trackingUrl: text('tracking_url'),
  cancellationReason: text('cancellation_reason'),
  idempotencyKey: text('idempotency_key').unique(),
  customerNote: text('customer_note'),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  variantId: uuid('variant_id').references(() => productVariants.id, {
    onDelete: 'set null',
  }),
  productId: uuid('product_id').references(() => products.id, {
    onDelete: 'set null',
  }),
  productName: text('product_name').notNull(),
  sku: text('sku').notNull(),
  variantLabel: text('variant_label'),
  attributesSnapshot: jsonb('attributes_snapshot').notNull().default({}),
  unitGrossPence: bigint('unit_gross_pence', { mode: 'number' }).notNull(),
  quantity: integer('quantity').notNull(),
  discountPence: bigint('discount_pence', { mode: 'number' }).notNull().default(0),
  vatRateBps: integer('vat_rate_bps').notNull(),
  vatPence: bigint('vat_pence', { mode: 'number' }).notNull(),
  netPence: bigint('net_pence', { mode: 'number' }).notNull(),
  lineGrossPence: bigint('line_gross_pence', { mode: 'number' }).notNull(),
});

export const orderAddresses = pgTable(
  'order_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    type: addressTypeEnum('type').notNull(),
    fullName: text('full_name').notNull(),
    line1: text('line1').notNull(),
    line2: text('line2'),
    city: text('city').notNull(),
    county: text('county'),
    postcode: text('postcode').notNull(),
    postcodeNormalized: text('postcode_normalized').notNull(),
    country: char('country', { length: 2 }).notNull().default('GB'),
    phone: text('phone'),
  },
  (t) => [unique().on(t.orderId, t.type)],
);

export const orderStatusHistory = pgTable('order_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  fromStatus: orderStatusEnum('from_status'),
  toStatus: orderStatusEnum('to_status').notNull(),
  actorType: actorTypeEnum('actor_type').notNull(),
  actorId: uuid('actor_id'),
  note: text('note'),
  visibility: timelineVisibilityEnum('visibility').notNull().default('CUSTOMER'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentBankAccounts = pgTable('payment_bank_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  bankName: text('bank_name').notNull(),
  accountName: text('account_name').notNull(),
  sortCode: text('sort_code').notNull(),
  accountNumber: text('account_number').notNull(),
  iban: text('iban'),
  referenceInstructions: text('reference_instructions')
    .notNull()
    .default('Use your order number as the payment reference.'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .unique()
    .references(() => orders.id),
  method: paymentMethodEnum('method').notNull().default('BANK_TRANSFER'),
  status: paymentStatusEnum('status').notNull().default('PENDING'),
  amountDuePence: bigint('amount_due_pence', { mode: 'number' }).notNull(),
  amountClaimedPence: bigint('amount_claimed_pence', { mode: 'number' }),
  currency: char('currency', { length: 3 }).notNull().default('GBP'),
  bankAccountSnapshot: jsonb('bank_account_snapshot').notNull().default({}),
  adminNote: text('admin_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentProofs = pgTable('payment_proofs', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id),
  storagePath: text('storage_path').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  amountClaimedPence: bigint('amount_claimed_pence', { mode: 'number' }),
  customerReference: text('customer_reference'),
  customerNote: text('customer_note'),
  status: proofStatusEnum('status').notNull().default('UPLOADED'),
  reviewedBy: uuid('reviewed_by').references(() => adminUsers.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const returnRequests = pgTable('return_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  status: returnStatusEnum('status').notNull().default('REQUESTED'),
  reason: text('reason'),
  customerNote: text('customer_note'),
  adminNote: text('admin_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const returnItems = pgTable('return_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  returnRequestId: uuid('return_request_id')
    .notNull()
    .references(() => returnRequests.id, { onDelete: 'cascade' }),
  orderItemId: uuid('order_item_id')
    .notNull()
    .references(() => orderItems.id),
  quantity: integer('quantity').notNull(),
  reason: text('reason'),
});
