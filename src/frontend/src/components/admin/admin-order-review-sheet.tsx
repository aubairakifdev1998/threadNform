"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { adminApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { PriceDisplay } from "@/components/ui/price";
import { StatusBadge } from "@/components/ui/status-badge";
import { Spinner } from "@/components/ui/page-shimmers";
import { AdminOrderFulfilment } from "@/components/admin/admin-order-fulfilment";
import { OrderTimeline } from "@/components/orders/order-timeline";
import {
  OrderStatusPill,
  PaymentStatusPill,
} from "@/components/orders/status-pill";
import { formatDate } from "@/lib/orders/presentation";

type AdminOrderDetail = Awaited<ReturnType<typeof adminApi.getOrder>>;

const NEEDS_PAYMENT_REVIEW = new Set([
  "PROOF_SUBMITTED",
  "UNDER_REVIEW",
  "PENDING",
  "REJECTED",
]);

export function AdminOrderReviewSheet({
  orderId,
  open,
  onOpenChange,
  onChanged,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  // Detail is cached per order id; what is shown is derived from it, so
  // opening another order never flashes the previous one.
  const [loaded, setLoaded] = useState<{
    id: string;
    detail: AdminOrderDetail | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const order =
    open && orderId && loaded?.id === orderId ? loaded.detail : null;
  const loading = Boolean(open && orderId && loaded?.id !== orderId);

  async function fetchDetail(id: string) {
    const token = tokenStore.getAccessToken();
    if (!token) return null;
    try {
      return await adminApi.getOrder(token, id);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load order",
      );
      return null;
    }
  }

  /** Refresh after an action. */
  async function load(id: string) {
    setLoaded({ id, detail: await fetchDetail(id) });
  }

  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    void fetchDetail(orderId).then((detail) => {
      if (cancelled) return;
      setLoaded({ id: orderId, detail });
      setRejectReason("");
    });
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  const payment = order?.payment;
  const amountDue =
    payment?.amountDuePence ?? order?.grandTotalPence ?? order?.totalPence ?? 0;
  const proofs = payment?.proofs ?? [];
  const canReviewPayment =
    Boolean(payment) &&
    NEEDS_PAYMENT_REVIEW.has(payment?.status ?? "") &&
    proofs.length > 0;
  const waitingForProof =
    Boolean(payment) &&
    NEEDS_PAYMENT_REVIEW.has(payment?.status ?? "") &&
    proofs.length === 0;
  const paymentVerified = [
    "VERIFIED",
    "PARTIALLY_REFUNDED",
    "REFUND_PENDING",
    "REFUNDED",
  ].includes(payment?.status ?? "");

  async function approve() {
    const token = tokenStore.getAccessToken();
    if (!token || !payment) return;
    if (proofs.length === 0) {
      toast.error("Open and check payment proof before approving");
      return;
    }
    setBusy(true);
    try {
      await adminApi.approvePayment(token, payment.id, crypto.randomUUID());
      toast.success("Payment verified — order confirmed");
      await load(order!.id);
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const token = tokenStore.getAccessToken();
    const reason = rejectReason.trim();
    if (!token || !payment) return;
    if (!reason) {
      toast.error("Provide a rejection reason for the customer");
      return;
    }
    setBusy(true);
    try {
      await adminApi.rejectPayment(token, payment.id, reason);
      toast.success("Payment rejected — customer can re-upload proof");
      setRejectReason("");
      await load(order!.id);
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle>{order?.orderNumber ?? "Order review"}</SheetTitle>
          <SheetDescription>
            {order
              ? `Placed ${formatDate(order.placedAt, true)} · ${order.items?.length ?? 0} item line(s)`
              : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 py-4">
          {loading || !order ? (
            <div className="flex justify-center py-16">
              <Spinner label="Loading order…" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <OrderStatusPill status={order.status} />
                <PaymentStatusPill
                  status={payment?.status ?? order.paymentStatus}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-4 text-sm">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Customer
                  </h3>
                  <a
                    href={`mailto:${order.email}`}
                    className="block truncate font-medium underline-offset-4 hover:underline"
                  >
                    {order.email}
                  </a>
                  {order.phone ? (
                    <a
                      href={`tel:${order.phone}`}
                      className="block text-muted-foreground"
                    >
                      {order.phone}
                    </a>
                  ) : null}
                  {order.shippingAddress ? (
                    <address className="mt-3 not-italic leading-relaxed text-muted-foreground">
                      {order.shippingAddress.fullName}
                      <br />
                      {order.shippingAddress.line1}
                      {order.shippingAddress.line2
                        ? `, ${order.shippingAddress.line2}`
                        : ""}
                      <br />
                      {order.shippingAddress.city}{" "}
                      {order.shippingAddress.postcode}
                    </address>
                  ) : null}
                  {order.shippingMethodSnapshot?.name ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {order.shippingMethodSnapshot.name}
                    </p>
                  ) : null}
                  {order.customerNote ? (
                    <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs">
                      “{order.customerNote}”
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border p-4 text-sm">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Amounts
                  </h3>
                  <dl className="space-y-1">
                    {order.subtotalPence != null ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Items</dt>
                        <dd>
                          <PriceDisplay pence={order.subtotalPence} size="sm" />
                        </dd>
                      </div>
                    ) : null}
                    {order.shippingPence != null ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Delivery</dt>
                        <dd>
                          <PriceDisplay pence={order.shippingPence} size="sm" />
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between font-semibold">
                      <dt>Total due</dt>
                      <dd>
                        <PriceDisplay pence={amountDue} size="sm" />
                      </dd>
                    </div>
                    {payment?.amountClaimedPence != null ? (
                      <div
                        className={cn(
                          "flex justify-between",
                          payment.amountClaimedPence !== amountDue &&
                            "font-medium text-destructive",
                        )}
                      >
                        <dt>Customer says paid</dt>
                        <dd>
                          <PriceDisplay
                            pence={payment.amountClaimedPence}
                            size="sm"
                          />
                        </dd>
                      </div>
                    ) : null}
                    {order.refundedPence ? (
                      <div className="flex justify-between text-success">
                        <dt>Refunded</dt>
                        <dd className="inline-flex items-baseline gap-0.5">
                          −
                          <PriceDisplay pence={order.refundedPence} size="sm" />
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {order.vatPence != null ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Incl. VAT{" "}
                      <PriceDisplay pence={order.vatPence} size="sm" />
                    </p>
                  ) : null}
                  {payment?.amountClaimedPence != null &&
                  payment.amountClaimedPence !== amountDue ? (
                    <p className="mt-2 text-xs text-destructive">
                      Claimed amount differs from the total — check the bank
                      statement before approving.
                    </p>
                  ) : null}
                </div>
              </div>

              {paymentVerified && order.items?.length ? (
                <AdminOrderFulfilment
                  key={JSON.stringify([
                    order.status,
                    order.refundedPence,
                    order.items.map((i) => [
                      i.quantityShipped,
                      i.quantityCancelled,
                      i.quantityReturned,
                    ]),
                  ])}
                  orderId={order.id}
                  orderStatus={order.status}
                  paymentStatus={payment?.status ?? order.paymentStatus}
                  grandTotalPence={
                    order.grandTotalPence ?? payment?.amountDuePence ?? 0
                  }
                  refundedPence={order.refundedPence ?? 0}
                  items={order.items}
                  shipments={order.shipments ?? []}
                  refunds={order.refunds ?? []}
                  canRefund
                  onChanged={async () => {
                    await load(order.id);
                    onChanged?.();
                  }}
                />
              ) : order.items?.length ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Items</h3>
                  <ul className="divide-y divide-border border border-border text-sm">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex justify-between gap-3 px-3 py-2"
                      >
                        <span className="text-muted-foreground">
                          {item.productName} · {item.sku} × {item.quantity}
                        </span>
                        <PriceDisplay pence={item.lineGrossPence} size="sm" />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Payment evidence</h3>
                  {paymentVerified ? (
                    <StatusBadge tone="success">Verified</StatusBadge>
                  ) : waitingForProof ? (
                    <StatusBadge tone="neutral">Waiting for proof</StatusBadge>
                  ) : canReviewPayment ? (
                    <StatusBadge tone="warning">Needs review</StatusBadge>
                  ) : null}
                </div>

                {!payment ? (
                  <p className="text-sm text-muted-foreground">
                    No payment record on this order.
                  </p>
                ) : proofs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Customer has not uploaded payment proof yet. You cannot
                    approve until evidence is attached.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {proofs.map((proof) => (
                      <div
                        key={proof.id}
                        className="overflow-hidden rounded-md border border-border bg-muted/20"
                      >
                        {proof.url && proof.isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proof.url}
                            alt="Payment proof"
                            className="max-h-64 w-full object-contain bg-background"
                          />
                        ) : (
                          <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
                            {proof.mime || "File"}
                          </div>
                        )}
                        <div className="space-y-1 border-t border-border p-3 text-xs text-muted-foreground">
                          {proof.customerReference ? (
                            <p>Customer ref: {proof.customerReference}</p>
                          ) : null}
                          {proof.customerNote ? (
                            <p>Note: {proof.customerNote}</p>
                          ) : null}
                          <p>
                            Uploaded{" "}
                            {new Date(proof.uploadedAt).toLocaleString("en-GB")}
                          </p>
                          {proof.url ? (
                            <a
                              href={proof.url}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                buttonVariants({
                                  variant: "outline",
                                  size: "sm",
                                }),
                                "mt-1",
                              )}
                            >
                              Open full evidence
                            </a>
                          ) : (
                            <p>Signed URL unavailable</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {order.timeline?.length ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Activity</h3>
                  <OrderTimeline entries={order.timeline} showVisibility />
                </div>
              ) : null}
            </>
          )}
        </div>

        {order && payment && !paymentVerified ? (
          <SheetFooter className="mt-auto flex-col gap-3 border-t border-border pt-4 sm:flex-col">
            <Button
              type="button"
              disabled={busy || !canReviewPayment}
              onClick={() => void approve()}
              className="w-full"
            >
              {busy ? "Working…" : "Approve payment & confirm order"}
            </Button>
            <div className="w-full space-y-2">
              <Label htmlFor="reject-reason">Reject reason</Label>
              <Input
                id="reject-reason"
                placeholder="e.g. Amount mismatch / unclear screenshot"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={busy || proofs.length === 0}
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || proofs.length === 0}
                onClick={() => void reject()}
                className="w-full"
              >
                Reject proof
              </Button>
            </div>
            {waitingForProof ? (
              <p className="text-xs text-muted-foreground">
                Approval is locked until the customer uploads proof.
              </p>
            ) : null}
          </SheetFooter>
        ) : null}

        {order && paymentVerified ? (
          <SheetFooter className="mt-auto border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              Payment verified. Record shipments (all or some items) and refunds
              above; status steps are also on the orders list.
            </p>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function orderNeedsPaymentReview(order: {
  status: string;
  paymentStatus?: string | null;
}) {
  return (
    ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW"].includes(
      order.status,
    ) ||
    ["PENDING", "PROOF_SUBMITTED", "UNDER_REVIEW", "REJECTED"].includes(
      order.paymentStatus ?? "",
    )
  );
}
