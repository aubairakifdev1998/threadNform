import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { actorTypeEnum, inventoryMovementTypeEnum } from './enums.js';
import { productVariants } from './catalog.js';

export const warehouses = pgTable('warehouses', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  address: jsonb('address').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    onHand: integer('on_hand').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.warehouseId, t.variantId)],
);

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  warehouseId: uuid('warehouse_id')
    .notNull()
    .references(() => warehouses.id),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => productVariants.id),
  quantityDelta: integer('quantity_delta').notNull(),
  movementType: inventoryMovementTypeEnum('movement_type').notNull(),
  referenceType: text('reference_type'),
  referenceId: uuid('reference_id'),
  previousOnHand: integer('previous_on_hand').notNull(),
  newOnHand: integer('new_on_hand').notNull(),
  previousReserved: integer('previous_reserved').notNull(),
  newReserved: integer('new_reserved').notNull(),
  actorType: actorTypeEnum('actor_type').notNull().default('SYSTEM'),
  actorId: uuid('actor_id'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
