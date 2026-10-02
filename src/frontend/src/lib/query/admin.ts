"use client";

import { useEffect } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { adminApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";

/**
 * Query keys for admin data. Everything lives under ["admin"] so a mutation
 * can mark all admin lists stale at once: only the lists on screen refetch,
 * the rest refetch when next shown.
 */
export const adminKeys = {
  all: ["admin"] as const,
  dashboard: () => [...adminKeys.all, "dashboard"] as const,
  paymentQueue: (params: PaymentQueueParams) =>
    [...adminKeys.all, "payments", "queue", params] as const,
  bankAccounts: () => [...adminKeys.all, "payments", "banks"] as const,
  orders: (params: OrderListParams) =>
    [...adminKeys.all, "orders", "list", params] as const,
  orderCounts: (q: string) => [...adminKeys.all, "orders", "counts", q] as const,
  products: (params: ProductListParams) =>
    [...adminKeys.all, "products", "list", params] as const,
  productVariants: (productId: string) =>
    [...adminKeys.all, "products", productId, "variants"] as const,
  customers: (params: CustomerListParams) =>
    [...adminKeys.all, "customers", "list", params] as const,
  customer: (id: string) => [...adminKeys.all, "customers", id] as const,
  inventory: (params: InventoryListParams) =>
    [...adminKeys.all, "inventory", params] as const,
  allProducts: (status: string) =>
    [...adminKeys.all, "products", "all", status] as const,
  warehouses: () => [...adminKeys.all, "warehouses"] as const,
};

export type PaymentQueueParams = {
  page: number;
  pageSize: number;
  status: string;
  q?: string;
  hasProof: "all" | "true" | "false";
};
export type OrderListParams = {
  page: number;
  pageSize: number;
  status?: string;
  paymentStatus?: string;
  q?: string;
};
export type ProductListParams = {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
};
export type InventoryListParams = {
  page: number;
  pageSize: number;
  productId?: string;
};
export type CustomerListParams = { page: number; pageSize: number; q?: string };

export type CustomerRow = {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  status?: string;
  createdAt?: string;
};

/** The admin's access token, read at request time so refreshed tokens are used. */
export function requireAccessToken() {
  const token = tokenStore.getAccessToken();
  if (!token) {
    throw new ApiError("Sign in required", {
      code: "UNAUTHORIZED",
      status: 401,
    });
  }
  return token;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** Toasts a query's error once per failure (queries have no onError in v5). */
export function useErrorToast(
  error: unknown,
  fallback: string,
  options: { ignoreStatus?: number } = {},
) {
  const { ignoreStatus } = options;
  useEffect(() => {
    if (!error) return;
    if (error instanceof ApiError && error.status === ignoreStatus) return;
    toast.error(errorMessage(error, fallback));
  }, [error, fallback, ignoreStatus]);
}

/**
 * A mutation that gets the access token itself and marks every admin query
 * stale on success (order, payment, stock and customer changes ripple across
 * lists and the dashboard).
 */
export function useAdminMutation<TVariables, TData = unknown>(
  mutate: (token: string, variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: TVariables) =>
      mutate(requireAccessToken(), variables),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard(),
    queryFn: () => adminApi.dashboard(requireAccessToken()),
  });
}

export function usePaymentQueue(params: PaymentQueueParams) {
  return useQuery({
    queryKey: adminKeys.paymentQueue(params),
    queryFn: () => adminApi.listPaymentQueue(requireAccessToken(), params),
    placeholderData: keepPreviousData,
  });
}

export function useBankAccounts() {
  return useQuery({
    queryKey: adminKeys.bankAccounts(),
    queryFn: async () => {
      const accounts = await adminApi.listBankAccounts(requireAccessToken());
      return Array.isArray(accounts) ? accounts : [];
    },
  });
}

export function useAdminOrders(params: OrderListParams) {
  return useQuery({
    queryKey: adminKeys.orders(params),
    queryFn: () => adminApi.listOrders(requireAccessToken(), params),
    placeholderData: keepPreviousData,
  });
}

export function useAdminProducts(params: ProductListParams) {
  return useQuery({
    queryKey: adminKeys.products(params),
    queryFn: () => adminApi.listProducts(requireAccessToken(), params),
    placeholderData: keepPreviousData,
  });
}

export function useProductVariants(productId: string) {
  return useQuery({
    queryKey: adminKeys.productVariants(productId),
    queryFn: () =>
      adminApi.listProductVariants(requireAccessToken(), productId),
    enabled: Boolean(productId),
  });
}

export function useAdminCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: adminKeys.customers(params),
    queryFn: async () => {
      const result = (await adminApi.listCustomers(
        requireAccessToken(),
        params,
      )) as { items?: CustomerRow[]; total?: number } | CustomerRow[];
      return Array.isArray(result)
        ? { items: result, total: result.length }
        : { items: result.items ?? [], total: result.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export function useAdminCustomer(id: string | null) {
  return useQuery({
    queryKey: adminKeys.customer(id ?? ""),
    queryFn: () => adminApi.getCustomer(requireAccessToken(), id!),
    enabled: Boolean(id),
  });
}

export function useWarehouses<T>() {
  return useQuery({
    queryKey: adminKeys.warehouses(),
    queryFn: async () => {
      const result = (await adminApi.listWarehouses(requireAccessToken())) as
        | T[]
        | { items?: T[] };
      return Array.isArray(result) ? result : (result.items ?? []);
    },
  });
}

export function useAdminInventory(params: InventoryListParams) {
  return useQuery({
    queryKey: adminKeys.inventory(params),
    queryFn: () => adminApi.listInventory(requireAccessToken(), params),
    placeholderData: keepPreviousData,
  });
}

/** Every product with the given statuses, fetched 100 (the API maximum) at a time. */
export function useAllAdminProducts(status: string) {
  return useQuery({
    queryKey: adminKeys.allProducts(status),
    queryFn: async () => {
      const token = requireAccessToken();
      const pageSize = 100;
      const first = await adminApi.listProducts(token, {
        page: 1,
        pageSize,
        status,
      });
      const pages = Math.ceil((first.total ?? 0) / pageSize);
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
          adminApi.listProducts(token, { page: i + 2, pageSize, status }),
        ),
      );
      return [first, ...rest].flatMap((result) => result.items ?? []);
    },
  });
}
