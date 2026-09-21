import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import type {
  CustomerReview,
  SiteBillboard,
  SiteContentRepository,
} from '../../../domain/repositories/site-content.repository.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import {
  customerReviews,
  siteBillboards,
} from '../../drizzle/schema/index.js';

@Injectable()
export class SupabaseSiteContentRepository implements SiteContentRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDB,
  ) {}

  async getActiveBillboard(): Promise<SiteBillboard | null> {
    const [row] = await this.db
      .select()
      .from(siteBillboards)
      .where(eq(siteBillboards.isActive, true))
      .orderBy(asc(siteBillboards.sortOrder))
      .limit(1);
    return row ? this.mapBillboard(row) : null;
  }

  async listBillboards(): Promise<SiteBillboard[]> {
    const rows = await this.db
      .select()
      .from(siteBillboards)
      .orderBy(asc(siteBillboards.sortOrder), desc(siteBillboards.createdAt));
    return rows.map(this.mapBillboard);
  }

  async upsertBillboard(
    input: Partial<Omit<SiteBillboard, 'createdAt' | 'updatedAt'>> & {
      id?: string;
    },
  ): Promise<SiteBillboard> {
    if (input.isActive) {
      await this.db
        .update(siteBillboards)
        .set({ isActive: false })
        .where(eq(siteBillboards.isActive, true));
    }

    const payload = {
      title: input.title ?? 'New Collection',
      subtitle: input.subtitle ?? null,
      seasonLabel: input.seasonLabel ?? null,
      ctaLabel: input.ctaLabel ?? 'Go to shop',
      ctaHref: input.ctaHref ?? '/shop',
      secondaryCtaLabel: input.secondaryCtaLabel ?? null,
      secondaryCtaHref: input.secondaryCtaHref ?? null,
      mediaType: input.mediaType ?? 'NONE',
      mediaUrl: input.mediaUrl ?? null,
      posterUrl: input.posterUrl ?? null,
      isActive: input.isActive ?? false,
      sortOrder: input.sortOrder ?? 0,
      updatedAt: new Date(),
    };

    if (input.id) {
      const [row] = await this.db
        .update(siteBillboards)
        .set(payload)
        .where(eq(siteBillboards.id, input.id))
        .returning();
      return this.mapBillboard(row);
    }

    const [row] = await this.db
      .insert(siteBillboards)
      .values(payload)
      .returning();
    return this.mapBillboard(row);
  }

  async setActiveBillboard(id: string): Promise<SiteBillboard> {
    await this.db
      .update(siteBillboards)
      .set({ isActive: false })
      .where(eq(siteBillboards.isActive, true));
    const [row] = await this.db
      .update(siteBillboards)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(siteBillboards.id, id))
      .returning();
    return this.mapBillboard(row);
  }

  async deleteBillboard(id: string): Promise<void> {
    await this.db.delete(siteBillboards).where(eq(siteBillboards.id, id));
  }

  async listPublishedReviews(): Promise<CustomerReview[]> {
    const rows = await this.db
      .select()
      .from(customerReviews)
      .where(eq(customerReviews.isPublished, true))
      .orderBy(asc(customerReviews.sortOrder), desc(customerReviews.createdAt));
    return rows.map(this.mapReview);
  }

  async listReviews(): Promise<CustomerReview[]> {
    const rows = await this.db
      .select()
      .from(customerReviews)
      .orderBy(asc(customerReviews.sortOrder), desc(customerReviews.createdAt));
    return rows.map(this.mapReview);
  }

  async createReview(
    input: Omit<CustomerReview, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CustomerReview> {
    const [row] = await this.db
      .insert(customerReviews)
      .values({
        customerName: input.customerName,
        rating: input.rating,
        title: input.title,
        body: input.body,
        imageUrl: input.imageUrl,
        location: input.location,
        isPublished: input.isPublished,
        sortOrder: input.sortOrder,
      })
      .returning();
    return this.mapReview(row);
  }

  async updateReview(
    id: string,
    input: Partial<Omit<CustomerReview, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CustomerReview> {
    const set: Partial<typeof customerReviews.$inferInsert> & {
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };
    if (input.customerName !== undefined) set.customerName = input.customerName;
    if (input.rating !== undefined) set.rating = input.rating;
    if (input.title !== undefined) set.title = input.title;
    if (input.body !== undefined) set.body = input.body;
    if (input.imageUrl !== undefined) set.imageUrl = input.imageUrl;
    if (input.location !== undefined) set.location = input.location;
    if (input.isPublished !== undefined) set.isPublished = input.isPublished;
    if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder;

    const [row] = await this.db
      .update(customerReviews)
      .set(set)
      .where(eq(customerReviews.id, id))
      .returning();
    return this.mapReview(row);
  }

  async deleteReview(id: string): Promise<void> {
    await this.db.delete(customerReviews).where(eq(customerReviews.id, id));
  }

  private mapBillboard = (
    row: typeof siteBillboards.$inferSelect,
  ): SiteBillboard => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? null,
    seasonLabel: row.seasonLabel ?? null,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    secondaryCtaLabel: row.secondaryCtaLabel ?? null,
    secondaryCtaHref: row.secondaryCtaHref ?? null,
    mediaType: row.mediaType as SiteBillboard['mediaType'],
    mediaUrl: row.mediaUrl ?? null,
    posterUrl: row.posterUrl ?? null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  private mapReview = (
    row: typeof customerReviews.$inferSelect,
  ): CustomerReview => ({
    id: row.id,
    customerName: row.customerName,
    rating: row.rating,
    title: row.title ?? null,
    body: row.body,
    imageUrl: row.imageUrl ?? null,
    location: row.location ?? null,
    isPublished: row.isPublished,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
