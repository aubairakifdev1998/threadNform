"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ordersApi } from "@/lib/api";
import { apiUpload, ApiError } from "@/lib/api/client";
import { getFreshAccessToken } from "@/lib/auth/current-user";
import { tokenStore } from "@/lib/auth/session";
import { formatGbp } from "@/lib/money";
import { OrderShimmer, Spinner } from "@/components/ui/page-shimmers";

function OrderAccessRecovery({
  orderNumber,
  onRecovered,
}: {
  orderNumber: string;
  onRecovered: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function recover() {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Enter the email used at checkout");
      return;
    }
    setBusy(true);
    try {
      const result = await ordersApi.lookup(orderNumber, trimmed);
      sessionStorage.setItem(
        `order-access:${orderNumber}`,
        JSON.stringify({
          email: result.email,
          viewToken: result.viewToken,
        }),
      );
      toast.success("Order access restored");
      onRecovered();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not find that order for this email",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-16">
      <div>
        <h1 className="font-display text-3xl">Open order {orderNumber}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the email used at checkout to restore access, or sign in with
          that same email.
        </p>
      </div>
      <div className="space-y-3 border border-border p-5">
        <div className="space-y-2">
          <Label htmlFor="recover-email">Checkout email</Label>
          <Input
            id="recover-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void recover();
            }}
          />
        </div>
        <Button
          type="button"
          disabled={busy}
          onClick={() => void recover()}
          className="w-full sm:w-auto"
        >
          {busy ? "Looking up…" : "Restore order access"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/login?next=${encodeURIComponent(`/orders/${orderNumber}`)}`}
          className="inline-flex h-10 items-center bg-foreground px-5 text-sm text-background"
        >
          Sign in
        </Link>
        <Link
          href="/account"
          className="inline-flex h-10 items-center border border-border px-5 text-sm"
        >
          Account
        </Link>
      </div>
    </div>
  );
}

type Proof = {
  id: string;
  mime: string;
  status: string;
  customerReference: string | null;
  uploadedAt: string;
  url: string | null;
  isImage: boolean;
};

type OrderDetail = {
  orderNumber: string;
  status: string;
  paymentStatus?: string;
  shippingStatus?: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  grandTotalPence?: number;
  totalPence?: number;
  refundedPence?: number;
  items?: Array<{
    id: string;
    productName: string;
    sku: string;
    quantity: number;
    lineGrossPence: number;
    quantityShipped?: number;
    quantityCancelled?: number;
    quantityReturned?: number;
  }>;
  shipments?: Array<{
    id: string;
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    shippedAt: string;
    items: Array<{ orderItemId: string; quantity: number }>;
  }>;
  refunds?: Array<{
    id: string;
    amountPence: number;
    reason: string;
    createdAt: string;
  }>;
  payment?: {
    id?: string;
    status?: string;
    amountDuePence?: number;
    amountClaimedPence?: number | null;
    bankAccount?: Record<string, unknown> | null;
    proofs?: Proof[];
  } | null;
};

export function OrderConfirmationPanel({
  orderNumber,
}: {
  orderNumber: string;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reference, setReference] = useState("");
  const signedIn = Boolean(tokenStore.getAccessToken());

  async function refresh() {
    const token = tokenStore.getAccessToken();
    let email: string | undefined;
    let viewToken: string | undefined;
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(`order-access:${orderNumber}`);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            email?: string;
            viewToken?: string;
          };
          email = parsed.email;
          viewToken = parsed.viewToken;
        }
      } catch {
        // ignore
      }
    }
    const data = await ordersApi.get(orderNumber, {
      accessToken: token,
      email,
      viewToken,
    });
    setOrder(data as OrderDetail);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof ApiError ? error.message : "Order not found",
          );
          setOrder(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  async function uploadProof(file: File) {
    const token = await getFreshAccessToken();
    if (!token) {
      toast.error("Sign in to upload payment proof");
      return;
    }
    if (
      ["VERIFIED", "PARTIALLY_REFUNDED", "REFUND_PENDING", "REFUNDED"].includes(
        order?.paymentStatus ?? "",
      )
    ) {
      toast.error("This payment is already verified");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "payment-proofs");
      formData.append("folder", `orders/${orderNumber}`);
      const uploaded = await apiUpload<{
        path: string;
        publicUrl?: string | null;
      }>("/storage/upload", formData, { accessToken: token });

      await ordersApi.submitPaymentProof(
        orderNumber,
        {
          storagePath: uploaded.path,
          mime: file.type || "application/octet-stream",
          sizeBytes: file.size,
          amountClaimedPence:
            order?.payment?.amountDuePence ??
            order?.grandTotalPence ??
            order?.totalPence,
          customerReference: reference || undefined,
        },
        token,
      );
      toast.success("Payment proof submitted for review");
      setReference("");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Unable to upload proof",
      );
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <OrderShimmer />;
  }

  if (!order) {
    return (
      <OrderAccessRecovery
        orderNumber={orderNumber}
        onRecovered={() => {
          setLoading(true);
          void refresh().finally(() => setLoading(false));
        }}
      />
    );
  }

  const bank = order.payment?.bankAccount as
    | {
        accountName?: string;
        sortCode?: string;
        accountNumber?: string;
        bankName?: string;
        referenceInstructions?: string;
      }
    | null
    | undefined;

  const total =
    order.payment?.amountDuePence ??
    order.grandTotalPence ??
    order.totalPence ??
    0;

  const paymentDone = [
    "VERIFIED",
    "PARTIALLY_REFUNDED",
    "REFUND_PENDING",
    "REFUNDED",
  ].includes(order.payment?.status ?? order.paymentStatus ?? "");
  const awaitingReview = ["PROOF_SUBMITTED", "UNDER_REVIEW"].includes(
    order.payment?.status ?? order.paymentStatus ?? "",
  );
  const proofs = order.payment?.proofs ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Order tracking
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold">
          {order.orderNumber}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{order.status}</Badge>
          <Badge variant="outline">
            Payment {order.paymentStatus ?? order.payment?.status ?? "—"}
          </Badge>
          <Badge variant="outline">
            Shipping {order.shippingStatus ?? "NOT_SHIPPED"}
          </Badge>
        </div>
      </div>

      {order.items && order.items.length > 0 ? (
        <section className="space-y-3 border border-border p-5 text-sm">
          <h2 className="font-medium">Items</h2>
          <ul className="space-y-2">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {item.productName} · {item.sku} × {item.quantity}
                  {item.quantityShipped &&
                  item.quantityShipped < item.quantity ? (
                    <span className="block text-xs">
                      {item.quantityShipped} of {item.quantity} shipped
                    </span>
                  ) : null}
                  {item.quantityCancelled ? (
                    <span className="block text-xs">
                      {item.quantityCancelled} cancelled and refunded
                    </span>
                  ) : null}
                  {item.quantityReturned ? (
                    <span className="block text-xs">
                      {item.quantityReturned} returned
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums">
                  {formatGbp(item.lineGrossPence)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {order.shipments && order.shipments.length > 1 ? (
        <section className="space-y-3 border border-border bg-secondary/30 p-5 text-sm">
          <h2 className="font-medium">Shipments ({order.shipments.length})</h2>
          <ul className="space-y-3">
            {order.shipments.map((shipment, index) => (
              <li key={shipment.id} className="space-y-1">
                <p className="font-medium">
                  Parcel {index + 1} ·{" "}
                  {new Date(shipment.shippedAt).toLocaleDateString("en-GB")}
                </p>
                <p className="text-muted-foreground">
                  {shipment.items
                    .map((line) => {
                      const item = order.items?.find(
                        (i) => i.id === line.orderItemId,
                      );
                      return `${item?.productName ?? "Item"} × ${line.quantity}`;
                    })
                    .join(", ")}
                </p>
                {shipment.carrier || shipment.trackingNumber ? (
                  <p className="text-muted-foreground">
                    {[shipment.carrier, shipment.trackingNumber]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                {shipment.trackingUrl ? (
                  <a
                    href={shipment.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    Track parcel {index + 1}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {order.refunds && order.refunds.length > 0 ? (
        <section className="space-y-2 border border-border p-5 text-sm">
          <h2 className="font-medium">Refunds</h2>
          <ul className="space-y-1">
            {order.refunds.map((refund) => (
              <li key={refund.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {new Date(refund.createdAt).toLocaleDateString("en-GB")} ·{" "}
                  {refund.reason}
                </span>
                <span className="tabular-nums">
                  {formatGbp(refund.amountPence)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Refunds are sent by bank transfer to the account you paid from and
            can take a few working days to arrive.
          </p>
        </section>
      ) : null}

      {(order.shipments?.length ?? 0) <= 1 &&
        (order.carrier || order.trackingNumber || order.trackingUrl) && (
          <section className="space-y-3 border border-border bg-secondary/30 p-5 text-sm">
            <h2 className="font-medium">Delivery tracking</h2>
            {order.carrier ? (
              <p className="text-muted-foreground">
                Carrier:{" "}
                <strong className="text-foreground">{order.carrier}</strong>
              </p>
            ) : null}
            {order.trackingNumber ? (
              <p className="text-muted-foreground">
                Tracking number:{" "}
                <strong className="text-foreground">
                  {order.trackingNumber}
                </strong>
              </p>
            ) : null}
            {order.trackingUrl ? (
              <a
                href={order.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-sm underline underline-offset-4"
              >
                Track shipment
              </a>
            ) : null}
          </section>
        )}

      {!paymentDone ? (
        <section className="space-y-3 border border-border bg-secondary/30 p-5 text-sm">
          <h2 className="font-medium">Pay by bank transfer</h2>
          <p className="text-muted-foreground">
            Amount due:{" "}
            <strong className="text-foreground">{formatGbp(total)}</strong>
          </p>
          {bank ? (
            <p className="leading-relaxed text-muted-foreground">
              {bank.accountName ? (
                <>
                  Account name: {bank.accountName}
                  <br />
                </>
              ) : null}
              {bank.bankName ? (
                <>
                  Bank: {bank.bankName}
                  <br />
                </>
              ) : null}
              Sort code: {bank.sortCode ?? "—"} · Account:{" "}
              {bank.accountNumber ?? "—"}
              <br />
              Reference:{" "}
              <strong className="text-foreground">{order.orderNumber}</strong>
              {bank.referenceInstructions ? (
                <>
                  <br />
                  {bank.referenceInstructions}
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-muted-foreground">
              Use order number <strong>{order.orderNumber}</strong> as your
              payment reference.
            </p>
          )}
        </section>
      ) : (
        <section className="border border-border bg-secondary/30 p-5 text-sm">
          <p className="font-medium">Payment verified</p>
          <p className="mt-1 text-muted-foreground">
            Thank you — your bank transfer has been confirmed.
          </p>
        </section>
      )}

      {proofs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
            Submitted proof
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {proofs.map((proof) => (
              <div
                key={proof.id}
                className="overflow-hidden border border-border"
              >
                {proof.url && proof.isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proof.url}
                    alt="Submitted payment proof"
                    className="max-h-48 w-full object-contain bg-secondary/20"
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                    {proof.mime}
                  </div>
                )}
                <div className="space-y-1 border-t border-border p-3 text-xs text-muted-foreground">
                  <Badge variant="outline">{proof.status}</Badge>
                  {proof.customerReference ? (
                    <p>Ref {proof.customerReference}</p>
                  ) : null}
                  <p>{new Date(proof.uploadedAt).toLocaleString("en-GB")}</p>
                  {proof.url ? (
                    <a
                      href={proof.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      Open file
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {awaitingReview ? (
            <p className="text-sm text-muted-foreground">
              Your proof is under review. We will update this order when payment
              is verified.
            </p>
          ) : null}
        </section>
      ) : null}

      {!paymentDone ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
            {proofs.length ? "Upload another proof" : "Upload payment proof"}
          </h2>
          {!signedIn ? (
            <p className="text-sm text-muted-foreground">
              <Link
                href={`/login?next=${encodeURIComponent(`/orders/${orderNumber}`)}`}
                className="underline"
              >
                Sign in
              </Link>{" "}
              to attach your transfer screenshot or PDF.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="reference">
                  Your bank reference (optional)
                </Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
              <Input
                type="file"
                accept="image/*,application/pdf"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadProof(file);
                  e.target.value = "";
                }}
              />
              {uploading ? <Spinner label="Uploading proof…" /> : null}
            </>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/account"
          className="inline-flex h-10 items-center bg-foreground px-5 text-sm text-background"
        >
          View account
        </Link>
        <Link
          href="/shop"
          className="inline-flex h-10 items-center border border-border px-5 text-sm"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
