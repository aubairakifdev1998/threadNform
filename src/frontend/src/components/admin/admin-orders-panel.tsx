"use client";

import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Trash2, XCircle } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import { DataTable } from "@/components/admin/data-table";
import { RowActions, type RowAction } from "@/components/admin/row-actions";
import { ToggleFilter } from "@/components/admin/toggle-filter";
import {
  AdminOrderReviewSheet,
  orderNeedsPaymentReview,
} from "@/components/admin/admin-order-review-sheet";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
  ShippingStatusBadge,
} from "@/components/status/status-badges";
import { Button } from "@/components/ui/button";
import { PriceDisplay } from "@/components/ui/price";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminApi } from "@/lib/api";
import {
  adminKeys,
  errorMessage,
  requireAccessToken,
  useAdminMutation,
  useAdminOrders,
} from "@/lib/query/admin";
import { formatDate } from "@/lib/orders/presentation";
import type { OrderSummary } from "@/types/api";

const PAGE_SIZE = 15;

/** Work queues. Each maps to the API's status / paymentStatus filters. */
const TABS = [
  { key: "all", label: "All", filter: {} },
  {
    key: "review",
    label: "Needs review",
    filter: { paymentStatus: "UNDER_REVIEW" },
    urgent: true,
  },
  {
    key: "awaiting",
    label: "Awaiting payment",
    filter: { status: "PENDING_PAYMENT,PAYMENT_SUBMITTED" },
  },
  {
    key: "fulfil",
    label: "To fulfil",
    filter: { status: "CONFIRMED,PROCESSING,PACKED,PARTIALLY_SHIPPED" },
  },
  { key: "shipped", label: "Shipped", filter: { status: "SHIPPED" } },
  {
    key: "done",
    label: "Completed",
    filter: { status: "DELIVERED,RETURN_REQUESTED,RETURNED,REFUNDED" },
  },
  { key: "cancelled", label: "Cancelled", filter: { status: "CANCELLED" } },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Quick status steps; shipments and refunds live in the order sheet. */
const NEXT: Record<string, Array<{ status: string; label: string }>> = {
  CONFIRMED: [{ status: "PROCESSING", label: "Start preparing" }],
  PROCESSING: [{ status: "PACKED", label: "Mark packed" }],
  SHIPPED: [{ status: "DELIVERED", label: "Mark delivered" }],
  RETURN_REQUESTED: [
    { status: "RETURNED", label: "Return received" },
    { status: "DELIVERED", label: "Decline return" },
  ],
  RETURNED: [{ status: "REFUNDED", label: "Refund remainder" }],
};

const CANCELLABLE = new Set([
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "PAYMENT_UNDER_REVIEW",
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
]);

const EMPTY_COPY: Record<TabKey, string> = {
  all: "Orders appear here as soon as customers check out.",
  review: "Nothing to review — you're all caught up.",
  awaiting: "No orders are waiting on a bank transfer right now.",
  fulfil: "Nothing to pack or ship at the moment.",
  shipped: "No orders are currently in transit.",
  done: "No completed orders in this period yet.",
  cancelled: "No cancelled orders — that's a good sign.",
};

function primaryAction(order: OrderSummary) {
  if (
    order.status !== "CANCELLED" &&
    orderNeedsPaymentReview(order) &&
    order.paymentStatus === "UNDER_REVIEW"
  ) {
    return { label: "Review payment", emphasis: true };
  }
  if (
    ["CONFIRMED", "PROCESSING", "PACKED", "PARTIALLY_SHIPPED"].includes(
      order.status,
    )
  ) {
    return { label: "Ship items", emphasis: true };
  }
  return { label: "Open", emphasis: false };
}

const TAB_KEYS = new Set<string>(TABS.map((t) => t.key));

export function AdminOrdersPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?queue=<key> lets the dashboard link straight into a work queue.
  const requestedQueue = searchParams.get("queue");
  const [tab, setTab] = useState<TabKey>(
    requestedQueue && TAB_KEYS.has(requestedQueue)
      ? (requestedQueue as TabKey)
      : "all",
  );
  const [searchDraft, setSearchDraft] = useState("");
  const search = useDebouncedValue(searchDraft.trim());
  const [page, setPage] = useState(1);
  // The open order lives in the URL (?review=<id>) so links and refresh work.
  const reviewId = searchParams.get("review");

  useEffect(() => {
    setPage(1);
  }, [tab, search]);

  const filter = TABS.find((t) => t.key === tab)?.filter ?? {};
  const orders = useAdminOrders({
    ...filter,
    q: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  // Tab totals depend only on the search, so paging and tab switches reuse them.
  const tabCounts = useQuery({
    queryKey: adminKeys.orderCounts(search),
    queryFn: async () => {
      const token = requireAccessToken();
      const totals = await Promise.all(
        TABS.map((t) =>
          adminApi
            .listOrders(token, {
              ...t.filter,
              q: search || undefined,
              pageSize: 1,
            })
            .then((r) => r.total ?? 0)
            .catch(() => undefined),
        ),
      );
      return Object.fromEntries(
        TABS.map((t, i) => [t.key, totals[i]]),
      ) as Partial<Record<TabKey, number>>;
    },
    placeholderData: keepPreviousData,
  });

  const items: OrderSummary[] = orders.data?.items ?? [];
  const total = orders.data?.total ?? 0;
  const counts = tabCounts.data ?? {};
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.all });

  const transitionMutation = useAdminMutation(
    (token, vars: { id: string; status: string; note?: string }) =>
      adminApi.transitionOrder(token, vars.id, {
        status: vars.status,
        note: vars.note,
      }),
  );
  const deleteMutation = useAdminMutation((token, id: string) =>
    adminApi.deleteOrder(token, id),
  );

  async function transition(id: string, status: string) {
    let note: string | undefined;
    if (status === "CANCELLED") {
      const reason = window.prompt(
        "Reason for cancelling (shown to the customer)",
      );
      if (!reason || reason.trim().length < 3) {
        if (reason !== null)
          toast.error("Enter a reason of at least 3 characters");
        return;
      }
      note = reason.trim();
    }
    try {
      await transitionMutation.mutateAsync({ id, status, note });
      toast.success(
        status === "CANCELLED"
          ? "Order cancelled — stock released"
          : "Order updated",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Update failed"));
    }
  }

  async function remove(id: string, orderNumber: string) {
    if (
      !window.confirm(
        `Permanently delete order ${orderNumber} and its payment history? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Order deleted");
      if (items.length === 1 && page > 1) setPage(page - 1);
    } catch (error) {
      toast.error(errorMessage(error, "Delete failed"));
    }
  }

  function openReview(id: string) {
    router.replace(`/admin/orders?review=${id}`, { scroll: false });
  }

  function closeReview(open: boolean) {
    if (!open) router.replace("/admin/orders", { scroll: false });
  }

  const columns = useMemo<ColumnDef<OrderSummary, unknown>[]>(
    () => [
      {
        accessorKey: "orderNumber",
        header: "Order",
        meta: { primary: true, label: "Order" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <button
              type="button"
              className="text-numeric text-left font-medium underline-offset-4 hover:underline"
              onClick={() => openReview(row.original.id)}
            >
              {row.original.orderNumber}
            </button>
            <p className="text-xs text-muted-foreground">
              {formatDate(
                row.original.placedAt ?? row.original.createdAt,
                true,
              )}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: "Customer",
        meta: { secondary: true, className: "max-w-[14rem]" },
        cell: ({ row }) => (
          <span className="block truncate text-sm text-muted-foreground">
            {row.original.email ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Order status",
        cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "paymentStatus",
        header: "Payment",
        cell: ({ row }) => (
          <PaymentStatusBadge status={row.original.paymentStatus} />
        ),
      },
      {
        accessorKey: "shippingStatus",
        header: "Fulfilment",
        meta: { secondary: true },
        cell: ({ row }) =>
          row.original.shippingStatus ? (
            <ShippingStatusBadge status={row.original.shippingStatus} />
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "grandTotalPence",
        header: "Total",
        meta: { align: "right" },
        cell: ({ row }) => (
          <div>
            <PriceDisplay
              pence={row.original.grandTotalPence ?? row.original.totalPence}
              size="sm"
            />
            {row.original.refundedPence ? (
              <p className="text-numeric text-xs text-muted-foreground">
                −
                {new Intl.NumberFormat("en-GB", {
                  style: "currency",
                  currency: "GBP",
                }).format(row.original.refundedPence / 100)}{" "}
                refunded
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { align: "right", cardFooter: true },
        cell: ({ row }) => {
          const order = row.original;
          const primary = primaryAction(order);
          const secondary: RowAction[] = [
            ...(NEXT[order.status] ?? []).map((next) => ({
              label: next.label,
              onSelect: () => void transition(order.id, next.status),
            })),
            ...(CANCELLABLE.has(order.status)
              ? [
                  {
                    label: "Cancel order",
                    icon: <XCircle aria-hidden />,
                    destructive: true,
                    separated: true,
                    onSelect: () => void transition(order.id, "CANCELLED"),
                  },
                ]
              : []),
            {
              label: "Delete permanently",
              icon: <Trash2 aria-hidden />,
              destructive: true,
              separated: !CANCELLABLE.has(order.status),
              onSelect: () => void remove(order.id, order.orderNumber),
            },
          ];

          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                size="sm"
                variant={primary.emphasis ? "default" : "outline"}
                onClick={() => openReview(order.id)}
              >
                {primary.label}
              </Button>
              <RowActions
                label={`order ${order.orderNumber}`}
                actions={secondary}
              />
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, items.length],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Orders"
        description="Work through payment reviews, then ship and refund from each order."
      />

      <DataTable
        caption="Orders"
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        isLoading={orders.isPending}
        isRefreshing={orders.isPlaceholderData}
        isError={orders.isError}
        error={orders.error}
        onRetry={() => void orders.refetch()}
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        searchPlaceholder="Order number, email or phone"
        toolbar={
          <ToggleFilter
            label="Order queues"
            value={tab}
            onChange={(next) => setTab(next)}
            options={TABS.map((t) => ({
              value: t.key,
              label: t.label,
              count: counts[t.key],
              urgentWhenCounted: "urgent" in t ? t.urgent : false,
            }))}
          />
        }
        empty={{
          icon: ClipboardList,
          title: search
            ? `No orders match “${search}”`
            : "Nothing in this queue",
          description: search
            ? "Try an order number, the customer's email, or their phone number."
            : EMPTY_COPY[tab],
          action: search ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchDraft("")}
            >
              Clear search
            </Button>
          ) : undefined,
        }}
        footer={
          !orders.isPending && !orders.isError && total > 0 ? (
            <AdminListPagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          ) : null
        }
      />

      <p className="text-xs text-muted-foreground">
        Bank transfer evidence can also be reviewed in bulk under{" "}
        <Link href="/admin/payments" className="underline underline-offset-4">
          Payments
        </Link>
        .
      </p>

      <AdminOrderReviewSheet
        orderId={reviewId}
        open={Boolean(reviewId)}
        onOpenChange={closeReview}
        onChanged={() => void refresh()}
      />
    </div>
  );
}
