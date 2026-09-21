import { apiRequest } from "@/lib/api/client";
import type { Cart, OrderSummary, UkAddress } from "@/types/api";

type CreateCartResponse = {
  cartId?: string;
  id?: string;
  guestToken?: string;
};

export const cartApi = {
  async create(): Promise<Cart> {
    const data = await apiRequest<CreateCartResponse>("/carts", {
      method: "POST",
      cache: "no-store",
    });
    const id = data.cartId ?? data.id;
    if (!id || !data.guestToken) {
      throw new Error("Invalid cart create response");
    }
    return { id, guestToken: data.guestToken, items: [] };
  },

  get(cartId: string, guestToken?: string | null) {
    return apiRequest<Cart>(`/carts/${cartId}`, {
      guestToken,
      cache: "no-store",
    });
  },

  addItem(
    cartId: string,
    body: { variantId: string; quantity: number },
    guestToken?: string | null,
  ) {
    return apiRequest(`/carts/${cartId}/items`, {
      method: "POST",
      body,
      guestToken,
      cache: "no-store",
    });
  },

  updateItem(
    cartId: string,
    itemId: string,
    quantity: number,
    guestToken?: string | null,
  ) {
    return apiRequest(`/carts/${cartId}/items/${itemId}`, {
      method: "PATCH",
      body: { quantity },
      guestToken,
      cache: "no-store",
    });
  },

  removeItem(cartId: string, itemId: string, guestToken?: string | null) {
    return apiRequest(`/carts/${cartId}/items/${itemId}`, {
      method: "DELETE",
      guestToken,
      cache: "no-store",
    });
  },

  merge(body: { guestToken: string }, accessToken: string) {
    return apiRequest<Cart>("/carts/merge", {
      method: "POST",
      body,
      accessToken,
      cache: "no-store",
    });
  },
};

export const shippingApi = {
  listMethods() {
    return apiRequest<
      Array<{
        id: string;
        code: string;
        name: string;
        description?: string | null;
        pricePence: number;
        etaMinDays?: number;
        etaMaxDays?: number;
      }>
    >("/shipping/methods", { cache: "no-store" });
  },
};

export const checkoutApi = {
  getBankDetails(options?: {
    accessToken?: string | null;
    cartId?: string | null;
    guestToken?: string | null;
  }) {
    return apiRequest<{
      bankName: string;
      accountName: string;
      sortCode: string;
      accountNumber: string;
      iban: string | null;
      referenceInstructions: string;
    }>("/checkout/bank-details", {
      accessToken: options?.accessToken,
      guestToken: options?.guestToken,
      searchParams: { cartId: options?.cartId ?? undefined },
      cache: "no-store",
    });
  },

  guest(
    body: {
      cartId: string;
      shippingMethodId: string;
      shippingAddress: UkAddress;
      billingAddress?: UkAddress;
      email: string;
      phone?: string;
      customerNote?: string;
    },
    options: { guestToken?: string | null; idempotencyKey: string },
  ) {
    return apiRequest<{
      orderNumber: string;
      viewToken?: string;
      paymentStatus?: string;
      status?: string;
    }>("/checkout", {
      method: "POST",
      body,
      guestToken: options.guestToken,
      idempotencyKey: options.idempotencyKey,
      cache: "no-store",
    });
  },

  authenticated(
    body: {
      cartId: string;
      shippingMethodId: string;
      shippingAddress: UkAddress;
      billingAddress?: UkAddress;
      email?: string;
      phone?: string;
      customerNote?: string;
    },
    options: {
      accessToken: string;
      idempotencyKey: string;
      guestToken?: string | null;
    },
  ) {
    return apiRequest<{
      orderNumber: string;
      viewToken?: string;
      paymentStatus?: string;
      status?: string;
    }>("/checkout/authenticated", {
      method: "POST",
      body,
      accessToken: options.accessToken,
      guestToken: options.guestToken,
      idempotencyKey: options.idempotencyKey,
      cache: "no-store",
    });
  },
};

export const ordersApi = {
  list(accessToken: string) {
    return apiRequest<{ items: OrderSummary[] }>("/orders", {
      accessToken,
      cache: "no-store",
    });
  },

  get(
    orderNumber: string,
    options?: {
      accessToken?: string | null;
      email?: string | null;
      viewToken?: string | null;
    },
  ) {
    return apiRequest<OrderSummary>(`/orders/${orderNumber}`, {
      accessToken: options?.accessToken,
      searchParams: {
        email: options?.email ?? undefined,
        viewToken: options?.viewToken ?? undefined,
      },
      cache: "no-store",
    });
  },

  lookup(orderNumber: string, email: string) {
    return apiRequest<{
      orderNumber: string;
      email: string;
      viewToken: string;
      status: string;
      paymentStatus: string;
    }>("/orders/lookup", {
      method: "POST",
      body: { orderNumber, email },
      cache: "no-store",
    });
  },

  submitPaymentProof(
    orderNumber: string,
    body: {
      storagePath: string;
      mime: string;
      sizeBytes: number;
      amountClaimedPence?: number;
      customerReference?: string;
      customerNote?: string;
    },
    accessToken?: string | null,
  ) {
    return apiRequest(`/orders/${orderNumber}/payment-proofs`, {
      method: "POST",
      body,
      accessToken,
      cache: "no-store",
    });
  },
};

export const addressesApi = {
  list(accessToken: string) {
    return apiRequest<import("@/types/api").CustomerAddress[]>(
      "/customers/me/addresses",
      {
        accessToken,
        cache: "no-store",
      },
    );
  },

  create(
    accessToken: string,
    body: {
      fullName: string;
      line1: string;
      line2?: string;
      city: string;
      county?: string;
      postcode: string;
      country?: string;
      phone?: string;
      isDefaultShipping?: boolean;
    },
  ) {
    return apiRequest<import("@/types/api").CustomerAddress>(
      "/customers/me/addresses",
      {
        method: "POST",
        body,
        accessToken,
        cache: "no-store",
      },
    );
  },

  update(
    accessToken: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    return apiRequest<import("@/types/api").CustomerAddress>(
      `/customers/me/addresses/${id}`,
      {
        method: "PATCH",
        body,
        accessToken,
        cache: "no-store",
      },
    );
  },

  remove(accessToken: string, id: string) {
    return apiRequest(`/customers/me/addresses/${id}`, {
      method: "DELETE",
      accessToken,
      cache: "no-store",
    });
  },
};

export const customersApi = {
  getProfile(accessToken: string) {
    return apiRequest<import("@/types/api").CustomerProfile>("/customers/me", {
      accessToken,
      cache: "no-store",
    });
  },

  updateProfile(
    accessToken: string,
    body: { fullName?: string | null; phone?: string | null },
  ) {
    return apiRequest<import("@/types/api").CustomerProfile>("/customers/me", {
      method: "PATCH",
      body,
      accessToken,
      cache: "no-store",
    });
  },
};
