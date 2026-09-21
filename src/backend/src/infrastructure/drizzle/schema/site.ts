import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const siteBillboards = pgTable('site_billboards', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull().default('New Collection'),
  subtitle: text('subtitle'),
  seasonLabel: text('season_label'),
  ctaLabel: text('cta_label').notNull().default('Go to shop'),
  ctaHref: text('cta_href').notNull().default('/shop'),
  secondaryCtaLabel: text('secondary_cta_label'),
  secondaryCtaHref: text('secondary_cta_href'),
  mediaType: text('media_type').notNull().default('IMAGE'),
  mediaUrl: text('media_url'),
  posterUrl: text('poster_url'),
  isActive: boolean('is_active').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerReviews = pgTable('customer_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerName: text('customer_name').notNull(),
  rating: integer('rating').notNull(),
  title: text('title'),
  body: text('body').notNull(),
  imageUrl: text('image_url'),
  location: text('location'),
  isPublished: boolean('is_published').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
