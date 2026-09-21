import { apiRequest } from "@/lib/api/client";
import type {
  AuthSession,
  CatalogFilters,
  Paginated,
  ProductDetail,
  ProductListParams,
  ProductSummary,
  ShippingMethod,
  User,
} from "@/types/api";

export const catalogApi = {
  listProducts(params?: ProductListParams) {
    return apiRequest<Paginated<ProductSummary>>("/products", {
      searchParams: params,
      cache: "no-store",
    });
  },

  getFilters() {
    return apiRequest<CatalogFilters>("/catalog/filters", {
      cache: "no-store",
    });
  },

  getProductBySlug(slug: string) {
    return apiRequest<ProductDetail>(`/products/${slug}`, {
      next: { revalidate: 60 },
    });
  },

  listDepartments() {
    return apiRequest<CatalogFilters["departments"]>("/departments", {
      next: { revalidate: 300 },
    });
  },

  listCategories(departmentId?: string) {
    return apiRequest<CatalogFilters["categories"]>("/categories", {
      searchParams: { departmentId },
      next: { revalidate: 300 },
    });
  },

  listBrands() {
    return apiRequest<CatalogFilters["brands"]>("/brands", {
      next: { revalidate: 300 },
    });
  },

  listCollections() {
    return apiRequest<CatalogFilters["collections"]>("/collections", {
      next: { revalidate: 300 },
    });
  },

  listShippingMethods() {
    return apiRequest<ShippingMethod[]>("/shipping/methods", {
      next: { revalidate: 300 },
    });
  },
};

export const authApi = {
  signIn(body: { email: string; password: string }) {
    return apiRequest<AuthSession>("/auth/sign-in", {
      method: "POST",
      body,
      cache: "no-store",
    });
  },

  signUp(body: {
    email: string;
    password: string;
    fullName: string;
    emailRedirectTo?: string;
  }) {
    return apiRequest<import("@/types/api").SignUpResult>("/auth/sign-up", {
      method: "POST",
      body,
      cache: "no-store",
    });
  },

  refresh(refreshToken: string) {
    return apiRequest<AuthSession>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      cache: "no-store",
    });
  },

  signOut(accessToken: string) {
    return apiRequest<void>("/auth/sign-out", {
      method: "POST",
      accessToken,
      cache: "no-store",
    });
  },

  me(accessToken: string) {
    return apiRequest<User>("/auth/me", {
      accessToken,
      cache: "no-store",
    });
  },

  forgotPassword(body: { email: string; redirectTo?: string }) {
    return apiRequest<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body,
      cache: "no-store",
    });
  },

  changePassword(accessToken: string, newPassword: string) {
    return apiRequest<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: { newPassword },
      accessToken,
      cache: "no-store",
    });
  },

  getGoogleOAuthUrl(redirectTo: string) {
    return apiRequest<{ url: string }>("/auth/oauth/google", {
      searchParams: { redirectTo },
      cache: "no-store",
    });
  },

  exchangeOAuthCode(code: string) {
    return apiRequest<AuthSession>("/auth/oauth/exchange", {
      method: "POST",
      body: { code },
      cache: "no-store",
    });
  },
};
