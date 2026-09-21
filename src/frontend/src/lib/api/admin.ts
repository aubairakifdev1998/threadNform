import { apiRequest, apiUpload } from "@/lib/api/client";
import type { AdminDashboard, OrderSummary, ProductSummary } from "@/types/api";

export const adminApi = {
  dashboard(accessToken: string) {
    return apiRequest<AdminDashboard>("/admin/dashboard", {
      accessToken,
      cache: "no-store",
    });
  },

  listProducts(
    accessToken: string,
    params?: { page?: number; pageSize?: number; q?: string; status?: string },
  ) {
    return apiRequest<{ items: ProductSummary[]; total?: number }>(
      "/admin/products",
      {
        accessToken,
        searchParams: params,
        cache: "no-store",
      },
    );
  },

  getProduct(accessToken: string, id: string) {
    return apiRequest<{
      id: string;
      name: string;
      slug: string;
      description?: string | null;
      shortDescription?: string | null;
      productType?: string;
      status?: string;
      categoryId?: string | null;
      departmentId?: string | null;
      basePricePence?: number | null;
      warehouseId?: string | null;
      totalOnHand?: number;
      totalAvailable?: number;
      variants: Array<{
        id: string;
        sku: string;
        status?: string;
        isDefault?: boolean;
        productId?: string;
        onHand: number;
        reserved: number;
        available: number;
        basePricePence?: number | null;
      }>;
    }>(`/admin/products/${id}`, {
      accessToken,
      cache: "no-store",
    });
  },

  createProduct(
    accessToken: string,
    body: {
      name: string;
      slug: string;
      description?: string;
      productType: "SIMPLE" | "VARIABLE";
      departmentId?: string;
      categoryId?: string;
      brandId?: string;
      basePricePence?: number;
      sku?: string;
      sizeValueIds?: string[];
      colorIds?: string[];
      initialStock?: number;
    },
  ) {
    return apiRequest("/admin/products", {
      method: "POST",
      body,
      accessToken,
      cache: "no-store",
    });
  },

  updateProduct(
    accessToken: string,
    id: string,
    body: {
      name?: string;
      slug?: string;
      description?: string;
      shortDescription?: string;
      status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
      categoryId?: string | null;
      departmentId?: string | null;
    },
  ) {
    return apiRequest(`/admin/products/${id}`, {
      method: "PATCH",
      body,
      accessToken,
      cache: "no-store",
    });
  },

  deleteProduct(accessToken: string, id: string) {
    return apiRequest<{ id: string; status: string; stockRowsRemoved: number }>(
      `/admin/products/${id}`,
      {
        method: "DELETE",
        accessToken,
        cache: "no-store",
      },
    );
  },

  createVariant(
    accessToken: string,
    productId: string,
    body: {
      sku: string;
      optionFingerprint?: string;
      sizeValueId?: string;
      colorId?: string;
      basePricePence?: number;
      initialStock?: number;
    },
  ) {
    return apiRequest(`/admin/products/${productId}/variants`, {
      method: "POST",
      body,
      accessToken,
      cache: "no-store",
    });
  },

  updateVariant(
    accessToken: string,
    productId: string,
    variantId: string,
    body: {
      sku?: string;
      status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
      isDefault?: boolean;
      basePricePence?: number;
    },
  ) {
    return apiRequest(
      `/admin/products/${productId}/variants/${variantId}`,
      {
        method: "PATCH",
        body,
        accessToken,
        cache: "no-store",
      },
    );
  },

  deleteVariant(accessToken: string, productId: string, variantId: string) {
    return apiRequest(`/admin/products/${productId}/variants/${variantId}`, {
      method: "DELETE",
      accessToken,
      cache: "no-store",
    });
  },

  listProductVariants(accessToken: string, productId: string) {
    return apiRequest<
      Array<{
        id: string;
        sku: string;
        status?: string;
        isDefault?: boolean;
        productId?: string;
        onHand: number;
        reserved: number;
        available: number;
      }>
    >(`/admin/products/${productId}/variants`, {
      accessToken,
      cache: "no-store",
    });
  },

  listOrders(
    accessToken: string,
    params?: { page?: number; pageSize?: number; status?: string },
  ) {
    return apiRequest<{ items: OrderSummary[]; total?: number }>(
      "/admin/orders",
      {
        accessToken,
        searchParams: params,
        cache: "no-store",
      },
    );
  },

  getOrder(accessToken: string, id: string) {
    return apiRequest<{
      id: string;
      orderNumber: string;
      status: string;
      paymentStatus: string;
      shippingStatus?: string;
      email: string;
      phone?: string | null;
      grandTotalPence?: number;
      totalPence?: number;
      carrier?: string | null;
      trackingNumber?: string | null;
      trackingUrl?: string | null;
      items: Array<{
        id: string;
        productName: string;
        sku: string;
        quantity: number;
        lineGrossPence: number;
      }>;
      payment: {
        id: string;
        status: string;
        amountDuePence: number;
        amountClaimedPence: number | null;
        bankAccountSnapshot?: Record<string, unknown> | null;
        proofs: Array<{
          id: string;
          mime: string;
          sizeBytes: number;
          amountClaimedPence: number | null;
          customerReference: string | null;
          customerNote: string | null;
          status: string;
          uploadedAt: string;
          url: string | null;
          isImage: boolean;
        }>;
      } | null;
    }>(`/admin/orders/${id}`, {
      accessToken,
      cache: "no-store",
    });
  },

  transitionOrder(
    accessToken: string,
    id: string,
    body: {
      status: string;
      note?: string;
      carrier?: string;
      trackingNumber?: string;
      trackingUrl?: string;
    },
  ) {
    return apiRequest(`/admin/orders/${id}/status`, {
      method: "PATCH",
      body,
      accessToken,
      cache: "no-store",
    });
  },

  listPaymentQueue(
    accessToken: string,
    params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      q?: string;
      hasProof?: "true" | "false" | "all";
    },
  ) {
    const searchParams: Record<string, string | number | undefined> = {
      page: params?.page,
      pageSize: params?.pageSize,
      status: params?.status,
      q: params?.q,
    };
    if (params?.hasProof === "true" || params?.hasProof === "false") {
      searchParams.hasProof = params.hasProof;
    }
    return apiRequest<{
      items: Array<{
        id: string;
        orderId: string;
        orderNumber: string;
        email: string;
        status: string;
        amountDuePence: number;
        amountClaimedPence: number | null;
        customerReference?: string | null;
        proofCount: number;
        proofs: Array<{
          id: string;
          storagePath: string;
          mime: string;
          sizeBytes: number;
          amountClaimedPence: number | null;
          customerReference: string | null;
          customerNote: string | null;
          status: string;
          uploadedAt: string;
          url: string | null;
          isImage: boolean;
        }>;
      }>;
      total: number;
      page: number;
      pageSize: number;
      totalPages?: number;
    }>("/admin/payments/queue", {
      accessToken,
      searchParams,
      cache: "no-store",
    });
  },

  listBankAccounts(accessToken: string) {
    return apiRequest<
      Array<{
        id: string;
        bankName: string;
        accountName: string;
        sortCode: string;
        accountNumber: string;
        iban: string | null;
        referenceInstructions: string;
        isActive: boolean;
      }>
    >("/admin/bank-accounts", {
      accessToken,
      cache: "no-store",
    });
  },

  upsertBankAccount(
    accessToken: string,
    body: {
      id?: string;
      bankName: string;
      accountName: string;
      sortCode: string;
      accountNumber: string;
      iban?: string | null;
      referenceInstructions?: string;
      isActive?: boolean;
    },
  ) {
    return apiRequest("/admin/bank-accounts", {
      method: "POST",
      body,
      accessToken,
      cache: "no-store",
    });
  },

  activateBankAccount(accessToken: string, id: string) {
    return apiRequest(`/admin/bank-accounts/${id}/activate`, {
      method: "PATCH",
      accessToken,
      cache: "no-store",
    });
  },

  approvePayment(
    accessToken: string,
    id: string,
    idempotencyKey: string,
  ) {
    return apiRequest(`/admin/payments/${id}/approve`, {
      method: "POST",
      accessToken,
      idempotencyKey,
      cache: "no-store",
    });
  },

  rejectPayment(accessToken: string, id: string, reason: string) {
    return apiRequest(`/admin/payments/${id}/reject`, {
      method: "POST",
      body: { reason },
      accessToken,
      cache: "no-store",
    });
  },

  listInventory(
    accessToken: string,
    params?: { page?: number; pageSize?: number; warehouseId?: string },
  ) {
    return apiRequest<{
      items: Array<{
        id: string;
        warehouseId: string;
        variantId: string;
        onHand: number;
        reserved: number;
        available: number;
        sku?: string | null;
        productId?: string | null;
        productName?: string | null;
        productSlug?: string | null;
      }>;
      total?: number;
    }>("/admin/inventory", {
      accessToken,
      searchParams: params,
      cache: "no-store",
    });
  },

  adjustInventory(
    accessToken: string,
    body: {
      warehouseId: string;
      variantId: string;
      onHandDelta: number;
      reason?: string;
      movementType?: string;
    },
  ) {
    return apiRequest("/admin/inventory/adjust", {
      method: "POST",
      body,
      accessToken,
      cache: "no-store",
    });
  },

  listWarehouses(accessToken: string) {
    return apiRequest("/admin/warehouses", {
      accessToken,
      cache: "no-store",
    });
  },

  listCustomers(
    accessToken: string,
    params?: { page?: number; pageSize?: number; q?: string },
  ) {
    return apiRequest("/admin/customers", {
      accessToken,
      searchParams: params,
      cache: "no-store",
    });
  },

  getCustomer(accessToken: string, id: string) {
    return apiRequest<{
      id: string;
      email: string;
      fullName?: string | null;
      phone?: string | null;
      status?: string;
      orderCount?: number;
      orders?: Array<{
        id: string;
        orderNumber: string;
        status: string;
        paymentStatus?: string;
        grandTotalPence?: number;
      }>;
    }>(`/admin/customers/${id}`, {
      accessToken,
      cache: "no-store",
    });
  },

  setCustomerStatus(
    accessToken: string,
    id: string,
    status: "ACTIVE" | "BLOCKED",
  ) {
    return apiRequest(`/admin/customers/${id}/status`, {
      method: "PATCH",
      body: { status },
      accessToken,
      cache: "no-store",
    });
  },

  deleteCustomer(
    accessToken: string,
    id: string,
    opts?: { deleteOrders?: boolean },
  ) {
    return apiRequest(`/admin/customers/${id}`, {
      method: "DELETE",
      accessToken,
      searchParams: {
        deleteOrders: opts?.deleteOrders === false ? "false" : "true",
      },
      cache: "no-store",
    });
  },

  deleteOrder(accessToken: string, id: string) {
    return apiRequest(`/admin/orders/${id}`, {
      method: "DELETE",
      accessToken,
      cache: "no-store",
    });
  },

  listSettings(accessToken: string) {
    return apiRequest<
      Array<{
        key: string;
        value: Record<string, unknown>;
        description?: string | null;
        updatedAt?: string;
      }>
    >("/admin/settings", {
      accessToken,
      cache: "no-store",
    });
  },

  updateSetting(
    accessToken: string,
    key: string,
    value: Record<string, unknown>,
    description?: string,
  ) {
    return apiRequest(`/admin/settings/${key}`, {
      method: "PUT",
      body: { value, description },
      accessToken,
      cache: "no-store",
    });
  },

  uploadFile(accessToken: string, formData: FormData) {
    return apiUpload<{ path: string; publicUrl?: string | null; url?: string }>(
      "/storage/upload",
      formData,
      {
        accessToken,
        cache: "no-store",
      },
    );
  },
};
