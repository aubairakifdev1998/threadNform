"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { formatGbp } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/page-shimmers";

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
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function load(id: string) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const detail = await adminApi.getOrder(token, id);
      setOrder(detail);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load order",
      );
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && orderId) {
      void load(orderId);
      setRejectReason("");
    } else {
      setOrder(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const payment = order?.payment;
  const proofs = payment?.proofs ?? [];
  const canReviewPayment =
    Boolean(payment) &&
    NEEDS_PAYMENT_REVIEW.has(payment?.status ?? "") &&
    proofs.length > 0;
  const waitingForProof =
    Boolean(payment) &&
    NEEDS_PAYMENT_REVIEW.has(payment?.status ?? "") &&
    proofs.length === 0;
  const paymentVerified = payment?.status === "VERIFIED";

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
      toast.error(
        error instanceof ApiError ? error.message : "Approve failed",
      );
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
      toast.error(
        error instanceof ApiError ? error.message : "Reject failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle>
            {order?.orderNumber ?? "Order review"}
          </SheetTitle>
          <SheetDescription>
            Check payment evidence before confirming. Approval verifies the
            transfer and moves the order to CONFIRMED.
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
                <Badge variant="secondary">{order.status}</Badge>
                <Badge variant="outline">
                  Payment {order.paymentStatus ?? payment?.status ?? "—"}
                </Badge>
                {order.shippingStatus ? (
                  <Badge variant="outline">
                    Shipping {order.shippingStatus}
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Customer</span>{" "}
                  {order.email}
                </p>
                <p>
                  <span className="text-muted-foreground">Total</span>{" "}
                  <span className="font-medium tabular-nums">
                    {formatGbp(
                      payment?.amountDuePence ??
                        order.grandTotalPence ??
                        order.totalPence ??
                        0,
                    )}
                  </span>
                </p>
                {payment?.amountClaimedPence != null ? (
                  <p>
                    <span className="text-muted-foreground">Claimed</span>{" "}
                    <span className="tabular-nums">
                      {formatGbp(payment.amountClaimedPence)}
                    </span>
                  </p>
                ) : null}
              </div>

              {order.items?.length ? (
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
                        <span className="tabular-nums">
                          {formatGbp(item.lineGrossPence)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Payment evidence</h3>
                  {paymentVerified ? (
                    <Badge>Verified</Badge>
                  ) : waitingForProof ? (
                    <Badge variant="outline">Waiting for proof</Badge>
                  ) : canReviewPayment ? (
                    <Badge variant="secondary">Needs review</Badge>
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
              Payment verified. Continue fulfilment from the orders list
              (Processing → Packed → Shipped).
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
