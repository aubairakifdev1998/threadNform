"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import {
  AdminOrderReviewSheet,
  orderNeedsPaymentReview,
} from "@/components/admin/admin-order-review-sheet";
import {
  OrderStatusPill,
  PaymentStatusPill,
} from "@/components/orders/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { formatGbp } from "@/lib/money";
import { formatDate } from "@/lib/orders/presentation";
import { cn } from "@/lib/utils";
import { AdminTableShimmer } from "@/components/ui/page-shimmers";
import type { OrderSummary } from "@/types/api";

const PAGE_SIZE = 15;

/** Work queues. Each maps to the API's status / paymentStatus filters. */
const TABS = [
  { key: "all", label: "All", filter: {} },
  {
    key: "review",
    label: "Needs review",
    filter: { paymentStatus: "UNDER_REVIEW" },
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

export function AdminOrdersPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("all");
  const [counts, setCounts] = useState<Partial<Record<TabKey, number>>>({});
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // The open order lives in the URL (?review=<id>) so links and refresh work.
  const reviewId = searchParams.get("review");

  const fetchPage = useCallback(async () => {
    const token = tokenStore.getAccessToken();
    if (!token)
      throw new ApiError("Sign in required", {
        code: "UNAUTHORIZED",
        status: 401,
      });
    const filter = TABS.find((t) => t.key === tab)?.filter ?? {};
    const [result, ...tabTotals] = await Promise.all([
      adminApi.listOrders(token, {
        ...filter,
        q: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
      ...TABS.map((t) =>
        adminApi
          .listOrders(token, {
            ...t.filter,
            q: search || undefined,
            pageSize: 1,
          })
          .then((r) => r.total ?? 0)
          .catch(() => undefined),
      ),
    ]);
    return {
      items: result?.items ?? [],
      total: result?.total ?? 0,
      counts: Object.fromEntries(
        TABS.map((t, i) => [t.key, tabTotals[i]]),
      ) as Partial<Record<TabKey, number>>,
    };
  }, [tab, search, page]);

  const apply = useCallback(
    (
      outcome:
        | { ok: true; data: Awaited<ReturnType<typeof fetchPage>> }
        | { ok: false; error: unknown },
    ) => {
      if (outcome.ok) {
        setItems(outcome.data.items);
        setTotal(outcome.data.total);
        setCounts(outcome.data.counts);
      } else {
        toast.error(
          outcome.error instanceof ApiError
            ? outcome.error.message
            : "Failed to load orders",
        );
        setItems([]);
      }
      setLoading(false);
    },
    [],
  );

  /** Reload after an action (outside the effect). */
  const load = useCallback(async () => {
    try {
      apply({ ok: true, data: await fetchPage() });
    } catch (error) {
      apply({ ok: false, error });
    }
  }, [fetchPage, apply]);

  useEffect(() => {
    let cancelled = false;
    fetchPage().then(
      (data) => !cancelled && apply({ ok: true, data }),
      (error: unknown) => !cancelled && apply({ ok: false, error }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchPage, apply]);

  /** Filter changes show the shimmer until the new page arrives. */
  function changeQuery(update: () => void) {
    setLoading(true);
    update();
  }

  async function transition(id: string, status: string) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
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
      await adminApi.transitionOrder(token, id, { status, note });
      toast.success(
        status === "CANCELLED"
          ? "Order cancelled — stock released"
          : "Order updated",
      );
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Update failed");
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
    const token = tokenStore.getAccessToken();
    if (!token) return;
    try {
      await adminApi.deleteOrder(token, id);
      toast.success("Order deleted");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    }
  }

  function openReview(id: string) {
    router.replace(`/admin/orders?review=${id}`, { scroll: false });
  }

  function closeReview(open: boolean) {
    if (!open) router.replace("/admin/orders", { scroll: false });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function RowActions({ order }: { order: OrderSummary }) {
    const primary = primaryAction(order);
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant={primary.emphasis ? "default" : "outline"}
          onClick={() => openReview(order.id)}
        >
          {primary.label}
        </Button>
        {(NEXT[order.status] ?? []).map((next) => (
          <Button
            key={next.status}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void transition(order.id, next.status)}
          >
            {next.label}
          </Button>
        ))}
        {CANCELLABLE.has(order.status) ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => void transition(order.id, "CANCELLED")}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => void remove(order.id, order.orderNumber)}
        >
          Delete
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Orders"
        description="Work through payment reviews, then ship and refund from each order. Payment evidence is also listed under Payments."
      />

      <div className="space-y-3">
        <div
          role="tablist"
          aria-label="Order queues"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() =>
                changeQuery(() => {
                  setTab(t.key);
                  setPage(1);
                })
              }
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm transition",
                tab === t.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card hover:bg-secondary",
              )}
            >
              {t.label}
              {counts[t.key] !== undefined ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    tab === t.key
                      ? "bg-background/20"
                      : t.key === "review" && counts[t.key]
                        ? "bg-warning/20 font-semibold"
                        : "bg-secondary",
                  )}
                >
                  {counts[t.key]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <form
          className="relative w-full md:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            changeQuery(() => {
              setSearch(searchDraft.trim());
              setPage(1);
            });
          }}
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Order number, email or phone"
            className="pl-9"
            aria-label="Search orders"
          />
        </form>
      </div>

      {loading ? (
        <AdminTableShimmer />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            {search
              ? `No orders match “${search}”.`
              : tab === "review"
                ? "Nothing to review — you're all caught up."
                : "No orders here yet."}
            {search ? (
              <button
                type="button"
                className="ml-2 underline underline-offset-4"
                onClick={() =>
                  changeQuery(() => {
                    setSearch("");
                    setSearchDraft("");
                  })
                }
              >
                Clear search
              </button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Phones: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {items.map((order) => (
              <li
                key={order.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => openReview(order.id)}
                  >
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(order.placedAt ?? order.createdAt, true)}
                    </p>
                    {order.email ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {order.email}
                      </p>
                    ) : null}
                  </button>
                  <p className="font-semibold tabular-nums">
                    {formatGbp(order.grandTotalPence ?? order.totalPence)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <OrderStatusPill status={order.status} />
                  <PaymentStatusPill status={order.paymentStatus} />
                </div>
                <div className="mt-3 border-t border-border pt-3">
                  <RowActions order={order} />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium underline-offset-4 hover:underline"
                          onClick={() => openReview(order.id)}
                        >
                          {order.orderNumber}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(order.placedAt ?? order.createdAt, true)}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate text-sm text-muted-foreground">
                        {order.email ?? "—"}
                      </TableCell>
                      <TableCell>
                        <OrderStatusPill status={order.status} />
                      </TableCell>
                      <TableCell>
                        <PaymentStatusPill status={order.paymentStatus} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatGbp(order.grandTotalPence ?? order.totalPence)}
                        {order.refundedPence ? (
                          <p className="text-xs text-muted-foreground">
                            −{formatGbp(order.refundedPence)} refunded
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <RowActions order={order} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <AdminListPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={(next) => changeQuery(() => setPage(next))}
          />
        </>
      )}

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
        onChanged={() => void load()}
      />
    </div>
  );
}
