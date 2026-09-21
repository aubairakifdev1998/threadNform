import { apiRequest } from "@/lib/api/client";
import type { AuthSession, CustomerReview, SiteBillboard } from "@/types/api";

export const siteApi = {
  getBillboard() {
    return apiRequest<SiteBillboard | null>("/site/billboard", {
      cache: "no-store",
    });
  },

  listReviews() {
    return apiRequest<CustomerReview[]>("/site/reviews", {
      cache: "no-store",
    });
  },
};

export const siteAdminApi = {
  listBillboards(accessToken: string) {
    return apiRequest<SiteBillboard[]>("/admin/site/billboards", {
      accessToken,
      cache: "no-store",
    });
  },

  upsertBillboard(
    accessToken: string,
    body: Partial<SiteBillboard> & { id?: string },
  ) {
    return apiRequest<SiteBillboard>("/admin/site/billboards", {
      method: "POST",
      body,
      accessToken,
      cache: "no-store",
    });
  },

  activateBillboard(accessToken: string, id: string) {
    return apiRequest<SiteBillboard>(`/admin/site/billboards/${id}/activate`, {
      method: "POST",
      accessToken,
      cache: "no-store",
    });
  },

  deleteBillboard(accessToken: string, id: string) {
    return apiRequest<void>(`/admin/site/billboards/${id}`, {
      method: "DELETE",
      accessToken,
      cache: "no-store",
    });
  },

  listReviews(accessToken: string) {
    return apiRequest<CustomerReview[]>("/admin/site/reviews", {
      accessToken,
      cache: "no-store",
    });
  },

  createReview(
    accessToken: string,
    body: {
      customerName: string;
      rating: number;
      title?: string | null;
      body: string;
      imageUrl?: string | null;
      location?: string | null;
      isPublished?: boolean;
      sortOrder?: number;
    },
  ) {
    return apiRequest<CustomerReview>("/admin/site/reviews", {
      method: "POST",
      body,
      accessToken,
      cache: "no-store",
    });
  },

  updateReview(
    accessToken: string,
    id: string,
    body: Partial<{
      customerName: string;
      rating: number;
      title: string | null;
      body: string;
      imageUrl: string | null;
      location: string | null;
      isPublished: boolean;
      sortOrder: number;
    }>,
  ) {
    return apiRequest<CustomerReview>(`/admin/site/reviews/${id}`, {
      method: "PATCH",
      body,
      accessToken,
      cache: "no-store",
    });
  },

  deleteReview(accessToken: string, id: string) {
    return apiRequest<void>(`/admin/site/reviews/${id}`, {
      method: "DELETE",
      accessToken,
      cache: "no-store",
    });
  },
};

// extend authApi helpers used by Google flow
export async function exchangeOAuthCode(code: string) {
  return apiRequest<AuthSession>("/auth/oauth/exchange", {
    method: "POST",
    body: { code },
    cache: "no-store",
  });
}
