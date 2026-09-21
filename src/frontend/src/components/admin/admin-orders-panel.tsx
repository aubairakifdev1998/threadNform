"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  AdminListPagination,
  paginateItems,
} from "@/components/admin/admin-list-pagination";
import {
  AdminOrderReviewSheet,
  orderNeedsPaymentReview,
} from "@/components/admin/admin-order-review-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { AdminTableShimmer } from "@/components/ui/page-shimmers";
import type { OrderSummary } from "@/types/api";

/** Fulfilment transitions only — confirmation comes from payment approval. */
const NEXT: Record<string, string[]> = {
  PENDING_PAYMENT: ["CANCELLED"],
  PAYMENT_SUBMITTED: ["CANCELLED"],
  PAYMENT_UNDER_REVIEW: ["CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
};

export function AdminOrdersPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reviewId, setReviewId] = useState<string | null>(null);

  async function load() {
    const token = tokenStore.getAccessToken();
    if (!token) {
      setLoading(false);
      toast.error("Sign in required");
      return;
    }
    setLoading(true);
    try {
      const result = await adminApi.listOrders(token, { pageSize: 50 });
      setItems(result?.items ?? []);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load orders",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const fromQuery = searchParams.get("review");
    if (fromQuery) setReviewId(fromQuery);
  }, [searchParams]);

  async function transition(id: string, status: string) {
    const token = tokenStore.getAccessToken();
    if (!token) return;

    let carrier: string | undefined;
    let trackingNumber: string | undefined;
    let trackingUrl: string | undefined;

    if (status === "SHIPPED") {
      carrier = window.prompt("Carrier (optional)", "Royal Mail") || undefined;
      trackingNumber =
        window.prompt("Tracking number (optional)") || undefined;
      trackingUrl = window.prompt("Tracking URL (optional)") || undefined;
    }

    try {
      await adminApi.transitionOrder(token, id, {
        status,
        carrier,
        trackingNumber,
        trackingUrl,
      });
      toast.success(
        status === "CANCELLED"
          ? "Order cancelled — stock released"
          : status === "SHIPPED"
            ? "Shipped — stock deducted"
            : `Moved to ${status}`,
      );
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Transition failed",
      );
    }
  }

  async function remove(id: string, orderNumber: string) {
    if (
      !window.confirm(
        `Permanently delete order ${orderNumber} and its payment history?`,
      )
    ) {
      return;
    }
    const token = tokenStore.getAccessToken();
    if (!token) return;
    try {
      await adminApi.deleteOrder(token, id);
      toast.success("Order and payment history deleted");
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Delete failed",
      );
    }
  }

  function openReview(id: string) {
    setReviewId(id);
    router.replace(`/admin/orders?review=${id}`, { scroll: false });
  }

  function closeReview(open: boolean) {
    if (!open) {
      setReviewId(null);
      router.replace("/admin/orders", { scroll: false });
    }
  }

  const paged = paginateItems(items, page, 10);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Orders"
        description="Open an order to review payment proof, then approve to confirm. Fulfilment steps run after payment is verified."
      />

      <p className="text-sm text-muted-foreground">
        Payments waiting for evidence review also appear under{" "}
        <Link href="/admin/payments" className="underline underline-offset-4">
          Payments
        </Link>
        .
      </p>

      {loading ? (
        <AdminTableShimmer />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No orders yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.items.map((order) => {
                    const needsReview = orderNeedsPaymentReview(order);
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          <button
                            type="button"
                            className="underline-offset-4 hover:underline"
                            onClick={() => openReview(order.id)}
                          >
                            {order.orderNumber}
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{order.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={needsReview ? "secondary" : "outline"}
                          >
                            {order.paymentStatus ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatGbp(
                            (order as { grandTotalPence?: number })
                              .grandTotalPence ?? order.totalPence,
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {needsReview ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => openReview(order.id)}
                              >
                                Review payment
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openReview(order.id)}
                              >
                                View
                              </Button>
                            )}
                            {(NEXT[order.status] ?? []).map((status) => (
                              <Button
                                key={status}
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void transition(order.id, status)
                                }
                              >
                                {status}
                              </Button>
                            ))}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void remove(order.id, order.orderNumber)
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {!loading && items.length > 0 ? (
        <AdminListPagination
          page={paged.page}
          totalPages={paged.totalPages}
          total={paged.total}
          pageSize={10}
          onPageChange={setPage}
        />
      ) : null}

      <AdminOrderReviewSheet
        orderId={reviewId}
        open={Boolean(reviewId)}
        onOpenChange={closeReview}
        onChanged={() => void load()}
      />
    </div>
  );
}
