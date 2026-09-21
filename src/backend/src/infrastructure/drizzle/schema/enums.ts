import { pgEnum } from 'drizzle-orm/pg-core';

export const adminRoleEnum = pgEnum('admin_role', ['OWNER', 'ADMIN', 'STAFF']);

export const productStatusEnum = pgEnum('product_status', [
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED',
]);

export const productTypeEnum = pgEnum('product_type', ['SIMPLE', 'VARIABLE']);

export const attributeRoleEnum = pgEnum('attribute_role', [
  'VARIANT_DEFINING',
  'INFORMATIONAL',
]);

export const inventoryMovementTypeEnum = pgEnum('inventory_movement_type', [
  'INITIAL_STOCK',
  'PURCHASE',
  'MANUAL_ADJUSTMENT',
  'ORDER_RESERVATION',
  'ORDER_RELEASE',
  'ORDER_FULFILLMENT',
  'RETURN',
  'DAMAGE',
  'LOSS',
  'TRANSFER',
]);

export const orderStatusEnum = pgEnum('order_status', [
  'PENDING_PAYMENT',
  'PAYMENT_SUBMITTED',
  'PAYMENT_UNDER_REVIEW',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUNDED',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'PENDING',
  'PROOF_SUBMITTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
  'REFUND_PENDING',
  'REFUNDED',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['BANK_TRANSFER']);

export const proofStatusEnum = pgEnum('proof_status', [
  'UPLOADED',
  'UNDER_REVIEW',
  'ACCEPTED',
  'REJECTED',
]);

export const cartStatusEnum = pgEnum('cart_status', [
  'ACTIVE',
  'CONVERTED',
  'ABANDONED',
]);

export const mediaTypeEnum = pgEnum('media_type', ['IMAGE', 'VIDEO']);

export const shippingStatusEnum = pgEnum('shipping_status', [
  'NOT_SHIPPED',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
]);

export const returnStatusEnum = pgEnum('return_status', [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'RECEIVED',
  'RESTOCKED',
  'REFUNDED',
]);

export const addressTypeEnum = pgEnum('address_type', ['SHIPPING', 'BILLING']);

export const actorTypeEnum = pgEnum('actor_type', [
  'CUSTOMER',
  'ADMIN',
  'SYSTEM',
]);

export const timelineVisibilityEnum = pgEnum('timeline_visibility', [
  'CUSTOMER',
  'ADMIN',
  'INTERNAL',
]);
