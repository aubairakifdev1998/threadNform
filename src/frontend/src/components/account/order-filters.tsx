"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleFilter } from "@/components/admin/toggle-filter";
import { Button } from "@/components/ui/button";
import type { OrderSummary } from "@/types/api";

export type OrderStatusFilter =
  | "all"
  | "awaiting_payment"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentStatusFilter =
  | "all"
  | "unpaid"
  | "reviewing"
  | "paid"
  | "rejected";

export type OrderFilterState = {
  query: string;
  status: OrderStatusFilter;
  payment: PaymentStatusFilter;
};

export const DEFAULT_ORDER_FILTERS: OrderFilterState = {
  query: "",
  status: "all",
  payment: "all",
};

const STATUS_GROUPS: Record<Exclude<OrderStatusFilter, "all">, Set<string>> = {
  awaiting_payment: new Set([
    "PENDING_PAYMENT",
    "PAYMENT_SUBMITTED",
    "PAYMENT_UNDER_REVIEW",
  ]),
  preparing: new Set(["CONFIRMED", "PROCESSING", "PACKED", "PAID"]),
  shipped: new Set(["PARTIALLY_SHIPPED", "SHIPPED"]),
  delivered: new Set(["DELIVERED"]),
  cancelled: new Set([
    "CANCELLED",
    "RETURN_REQUESTED",
    "RETURNED",
    "REFUNDED",
  ]),
};

const PAYMENT_GROUPS: Record<
  Exclude<PaymentStatusFilter, "all">,
  Set<string>
> = {
  unpaid: new Set(["PENDING"]),
  reviewing: new Set(["PROOF_SUBMITTED", "UNDER_REVIEW"]),
  paid: new Set([
    "VERIFIED",
    "PARTIALLY_REFUNDED",
    "REFUND_PENDING",
    "REFUNDED",
  ]),
  rejected: new Set(["REJECTED"]),
};

export function filterOrders(
  orders: OrderSummary[],
  filters: OrderFilterState,
): OrderSummary[] {
  const q = filters.query.trim().toLowerCase();

  return orders.filter((order) => {
    if (filters.status !== "all") {
      if (!STATUS_GROUPS[filters.status].has(order.status)) return false;
    }
    if (filters.payment !== "all") {
      const payment = order.paymentStatus ?? "";
      if (!PAYMENT_GROUPS[filters.payment].has(payment)) return false;
    }
    if (!q) return true;
    const haystack = [
      order.orderNumber,
      order.trackingNumber,
      order.carrier,
      order.email,
      order.status,
      order.paymentStatus,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function countByStatus(
  orders: OrderSummary[],
): Record<OrderStatusFilter, number> {
  const counts: Record<OrderStatusFilter, number> = {
    all: orders.length,
    awaiting_payment: 0,
    preparing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };
  for (const order of orders) {
    for (const [key, set] of Object.entries(STATUS_GROUPS) as [
      Exclude<OrderStatusFilter, "all">,
      Set<string>,
    ][]) {
      if (set.has(order.status)) counts[key] += 1;
    }
  }
  return counts;
}

export function countByPayment(
  orders: OrderSummary[],
): Record<PaymentStatusFilter, number> {
  const counts: Record<PaymentStatusFilter, number> = {
    all: orders.length,
    unpaid: 0,
    reviewing: 0,
    paid: 0,
    rejected: 0,
  };
  for (const order of orders) {
    const payment = order.paymentStatus ?? "";
    for (const [key, set] of Object.entries(PAYMENT_GROUPS) as [
      Exclude<PaymentStatusFilter, "all">,
      Set<string>,
    ][]) {
      if (set.has(payment)) counts[key] += 1;
    }
  }
  return counts;
}

export function OrderFiltersBar({
  orders,
  value,
  onChange,
}: {
  orders: OrderSummary[];
  value: OrderFilterState;
  onChange: (next: OrderFilterState) => void;
}) {
  const statusCounts = countByStatus(orders);
  const paymentCounts = countByPayment(orders);
  const dirty =
    value.query.trim() !== "" ||
    value.status !== "all" ||
    value.payment !== "all";

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={value.query}
          onChange={(event) =>
            onChange({ ...value, query: event.target.value })
          }
          placeholder="Search by order number, tracking, or email"
          className="h-10 pl-9"
          aria-label="Search orders"
        />
        {value.query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
            onClick={() => onChange({ ...value, query: "" })}
            aria-label="Clear search"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <ToggleFilter
          label="Order status"
          value={value.status}
          onChange={(status) => onChange({ ...value, status })}
          options={[
            { value: "all", label: "All", count: statusCounts.all },
            {
              value: "awaiting_payment",
              label: "Awaiting payment",
              count: statusCounts.awaiting_payment,
              urgentWhenCounted: true,
            },
            {
              value: "preparing",
              label: "Preparing",
              count: statusCounts.preparing,
            },
            {
              value: "shipped",
              label: "Shipped",
              count: statusCounts.shipped,
            },
            {
              value: "delivered",
              label: "Delivered",
              count: statusCounts.delivered,
            },
            {
              value: "cancelled",
              label: "Closed",
              count: statusCounts.cancelled,
            },
          ]}
        />
        <ToggleFilter
          label="Payment status"
          value={value.payment}
          onChange={(payment) => onChange({ ...value, payment })}
          options={[
            { value: "all", label: "Any payment", count: paymentCounts.all },
            {
              value: "unpaid",
              label: "Unpaid",
              count: paymentCounts.unpaid,
              urgentWhenCounted: true,
            },
            {
              value: "reviewing",
              label: "Reviewing",
              count: paymentCounts.reviewing,
            },
            { value: "paid", label: "Paid", count: paymentCounts.paid },
            {
              value: "rejected",
              label: "Rejected",
              count: paymentCounts.rejected,
              urgentWhenCounted: true,
            },
          ]}
        />
        {dirty ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => onChange(DEFAULT_ORDER_FILTERS)}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
