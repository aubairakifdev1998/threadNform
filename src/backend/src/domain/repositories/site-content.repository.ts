export type SiteBillboard = {
  id: string;
  title: string;
  subtitle: string | null;
  seasonLabel: string | null;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
  mediaType: 'IMAGE' | 'VIDEO' | 'NONE';
  mediaUrl: string | null;
  posterUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomerReview = {
  id: string;
  customerName: string;
  rating: number;
  title: string | null;
  body: string;
  imageUrl: string | null;
  location: string | null;
  isPublished: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface SiteContentRepository {
  getActiveBillboard(): Promise<SiteBillboard | null>;
  listBillboards(): Promise<SiteBillboard[]>;
  upsertBillboard(
    input: Partial<Omit<SiteBillboard, 'createdAt' | 'updatedAt'>> & {
      id?: string;
    },
  ): Promise<SiteBillboard>;
  setActiveBillboard(id: string): Promise<SiteBillboard>;
  deleteBillboard(id: string): Promise<void>;

  listPublishedReviews(): Promise<CustomerReview[]>;
  listReviews(): Promise<CustomerReview[]>;
  createReview(
    input: Omit<CustomerReview, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CustomerReview>;
  updateReview(
    id: string,
    input: Partial<Omit<CustomerReview, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CustomerReview>;
  deleteReview(id: string): Promise<void>;
}

export const SITE_CONTENT_REPOSITORY = Symbol('SITE_CONTENT_REPOSITORY');
