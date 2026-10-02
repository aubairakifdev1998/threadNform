"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ExternalLink,
  FileText,
  Package,
  Truck,
  UploadCloud,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/orders/copy-field";
import { OrderProgress } from "@/components/orders/order-progress";
import {
  OrderTimeline,
  type TimelineEntry,
} from "@/components/orders/order-timeline";
import {
  OrderStatusPill,
  PaymentStatusPill,
  TONE_PANEL,
  TonePill,
} from "@/components/orders/status-pill";
import { ordersApi } from "@/lib/api";
import { apiUpload, ApiError } from "@/lib/api/client";
import { getFreshAccessToken } from "@/lib/auth/current-user";
import { tokenStore } from "@/lib/auth/session";
import { formatGbp } from "@/lib/money";
import {
  PAID_STATUSES,
  customerNextStep,
  formatDate,
  progressSteps,
} from "@/lib/orders/presentation";
import { cn } from "@/lib/utils";
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

type Address = {
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  county: string | null;
  postcode: string;
  phone: string | null;
};

type OrderDetail = {
  orderNumber: string;
  status: string;
  paymentStatus?: string;
  shippingStatus?: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  placedAt?: string;
  subtotalPence?: number;
  shippingPence?: number;
  vatPence?: number;
  grandTotalPence?: number;
  totalPence?: number;
  refundedPence?: number;
  shippingMethodSnapshot?: {
    name?: string;
    etaMinDays?: number;
    etaMaxDays?: number;
  };
  shippingAddress?: Address | null;
  items?: Array<{
    id: string;
    productName: string;
    sku: string;
    quantity: number;
    unitGrossPence?: number;
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
  timeline?: TimelineEntry[];
  payment?: {
    id?: string;
    status?: string;
    amountDuePence?: number;
    amountClaimedPence?: number | null;
    bankAccount?: Record<string, unknown> | null;
    proofs?: Proof[];
  } | null;
};

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const PROOF_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function Card({
  title,
  icon,
  children,
  className,
}: {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card p-5 sm:p-6",
        className,
      )}
    >
      {title ? (
        <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
          {icon}
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

function ProofDropzone({
  disabled,
  uploading,
  onFile,
}: {
  disabled: boolean;
  uploading: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function accept(file?: File | null) {
    if (!file) return;
    if (!PROOF_TYPES.includes(file.type)) {
      toast.error("Upload a JPG, PNG, WEBP or PDF file");
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      toast.error("That file is larger than 10 MB");
      return;
    }
    onFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) accept(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition",
        dragging
          ? "border-foreground bg-secondary"
          : "border-border hover:border-foreground/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {uploading ? (
        <Spinner label="Uploading proof…" />
      ) : (
        <>
          <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">
            Drop your payment screenshot or PDF here
          </p>
          <p className="text-xs text-muted-foreground">
            or click to choose · JPG, PNG, WEBP or PDF up to 10 MB
          </p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={PROOF_TYPES.join(",")}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

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
    if (PAID_STATUSES.has(order?.paymentStatus ?? "")) {
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

  const bank = (order.payment?.bankAccount ?? null) as {
    accountName?: string;
    sortCode?: string;
    accountNumber?: string;
    bankName?: string;
    iban?: string | null;
  } | null;

  const total =
    order.payment?.amountDuePence ??
    order.grandTotalPence ??
    order.totalPence ??
    0;
  const paymentStatus = order.payment?.status ?? order.paymentStatus ?? "";
  const paymentDone = PAID_STATUSES.has(paymentStatus);
  const acceptsProof = !paymentDone && order.status !== "CANCELLED";
  const proofs = order.payment?.proofs ?? [];
  const rejection = [...(order.timeline ?? [])]
    .reverse()
    .find((e) => e.note?.startsWith("Payment rejected:"));
  const next = customerNextStep({
    status: order.status,
    paymentStatus,
    rejectionNote:
      rejection?.note?.replace(/^Payment rejected:\s*/, "") ?? null,
  });
  const steps = progressSteps(order.status, paymentStatus);
  const shipments = order.shipments ?? [];
  const refunds = order.refunds ?? [];
  const refunded = order.refundedPence ?? 0;
  const itemName = (id: string) =>
    order.items?.find((i) => i.id === id)?.productName ?? "Item";
  const singleTracking =
    shipments.length <= 1 &&
    (order.carrier || order.trackingNumber || order.trackingUrl);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Order · placed {formatDate(order.placedAt)}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
            {order.orderNumber}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <OrderStatusPill status={order.status} />
          <PaymentStatusPill status={paymentStatus} />
        </div>
      </div>

      <div
        className={cn(
          "mt-6 rounded-lg border p-4 sm:p-5",
          TONE_PANEL[next.tone],
        )}
      >
        <p className="font-medium">{next.title}</p>
        {next.body ? (
          <p className="mt-1 text-sm text-muted-foreground">{next.body}</p>
        ) : null}
      </div>

      {steps ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-5 sm:p-6">
          <OrderProgress steps={steps} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {acceptsProof ? (
            <Card title="Pay by bank transfer">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
                <span className="text-sm text-muted-foreground">
                  Amount to transfer
                </span>
                <span className="font-display text-3xl font-semibold tabular-nums">
                  {formatGbp(total)}
                </span>
              </div>
              <div className="divide-y divide-border">
                {bank?.accountName ? (
                  <CopyField label="Account name" value={bank.accountName} />
                ) : null}
                {bank?.sortCode ? (
                  <CopyField label="Sort code" value={bank.sortCode} />
                ) : null}
                {bank?.accountNumber ? (
                  <CopyField
                    label="Account number"
                    value={bank.accountNumber}
                  />
                ) : null}
                {bank?.iban ? (
                  <CopyField label="IBAN" value={bank.iban} />
                ) : null}
                <CopyField
                  label="Payment reference — use exactly"
                  value={order.orderNumber}
                  emphasis
                />
              </div>
              {bank?.bankName ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Bank: {bank.bankName}
                </p>
              ) : null}

              <div className="mt-6 space-y-3 border-t border-border pt-5">
                <h3 className="text-sm font-medium">
                  {proofs.length
                    ? "Upload another proof"
                    : "Then upload your proof of payment"}
                </h3>
                {!signedIn ? (
                  <div className="rounded-md bg-secondary/60 p-4 text-sm">
                    <Link
                      href={`/login?next=${encodeURIComponent(`/orders/${orderNumber}`)}`}
                      className="font-medium underline underline-offset-4"
                    >
                      Sign in
                    </Link>{" "}
                    with the email used at checkout to upload your proof. No
                    account yet?{" "}
                    <Link
                      href="/register"
                      className="underline underline-offset-4"
                    >
                      Create one
                    </Link>{" "}
                    with the same email.
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="reference">
                        Your bank&apos;s transaction reference (optional)
                      </Label>
                      <Input
                        id="reference"
                        value={reference}
                        maxLength={100}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Helps us match your transfer faster"
                      />
                    </div>
                    <ProofDropzone
                      disabled={uploading}
                      uploading={uploading}
                      onFile={(file) => void uploadProof(file)}
                    />
                  </>
                )}
              </div>
            </Card>
          ) : null}

          {proofs.length ? (
            <Card
              title="Payment proofs"
              icon={<FileText className="size-4" aria-hidden />}
            >
              <ul className="grid gap-3 sm:grid-cols-2">
                {proofs.map((proof) => (
                  <li
                    key={proof.id}
                    className="overflow-hidden rounded-md border border-border"
                  >
                    {proof.url && proof.isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={proof.url}
                        alt="Submitted payment proof"
                        className="h-36 w-full bg-secondary/40 object-contain"
                      />
                    ) : (
                      <div className="flex h-36 items-center justify-center bg-secondary/40">
                        <FileText
                          className="size-8 text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted-foreground">
                      <span>{formatDate(proof.uploadedAt, true)}</span>
                      {proof.url ? (
                        <a
                          href={proof.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          Open <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {shipments.length > 0 || singleTracking ? (
            <Card
              title={
                shipments.length > 1
                  ? `Parcels (${shipments.length})`
                  : "Delivery"
              }
              icon={<Truck className="size-4" aria-hidden />}
            >
              <ul className="space-y-3">
                {(shipments.length
                  ? shipments
                  : [
                      {
                        id: "tracking",
                        carrier: order.carrier ?? null,
                        trackingNumber: order.trackingNumber ?? null,
                        trackingUrl: order.trackingUrl ?? null,
                        shippedAt: "",
                        items: [],
                      },
                    ]
                ).map((shipment, index) => (
                  <li
                    key={shipment.id}
                    className="rounded-md border border-border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {shipments.length > 1
                            ? `Parcel ${index + 1}`
                            : "Your parcel"}
                          {shipment.shippedAt ? (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · shipped {formatDate(shipment.shippedAt)}
                            </span>
                          ) : null}
                        </p>
                        {shipment.items.length ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {shipment.items
                              .map(
                                (line) =>
                                  `${itemName(line.orderItemId)} × ${line.quantity}`,
                              )
                              .join(", ")}
                          </p>
                        ) : null}
                        {shipment.carrier || shipment.trackingNumber ? (
                          <p className="mt-1 text-sm">
                            {[shipment.carrier, shipment.trackingNumber]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      {shipment.trackingUrl ? (
                        <a
                          href={shipment.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background"
                        >
                          Track parcel{" "}
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card
            title={`Items (${order.items?.length ?? 0})`}
            icon={<Package className="size-4" aria-hidden />}
          >
            <ul className="divide-y divide-border">
              {(order.items ?? []).map((item) => {
                const shipped = item.quantityShipped ?? 0;
                const cancelled = item.quantityCancelled ?? 0;
                const returned = item.quantityReturned ?? 0;
                return (
                  <li
                    key={item.id}
                    className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.sku} · Qty {item.quantity}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {shipped > 0 && shipped < item.quantity - cancelled ? (
                          <TonePill tone="info">
                            {shipped} of {item.quantity - cancelled} shipped
                          </TonePill>
                        ) : null}
                        {cancelled > 0 ? (
                          <TonePill tone="neutral">
                            {cancelled} cancelled · refunded
                          </TonePill>
                        ) : null}
                        {returned > 0 ? (
                          <TonePill tone="neutral">
                            {returned} returned
                          </TonePill>
                        ) : null}
                      </div>
                    </div>
                    <p
                      className={cn(
                        "shrink-0 tabular-nums",
                        cancelled === item.quantity &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      {formatGbp(item.lineGrossPence)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>

          {order.timeline?.length ? (
            <Card title="Order activity">
              <OrderTimeline entries={order.timeline} />
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card title="Summary">
            <dl className="space-y-2 text-sm">
              {order.subtotalPence != null ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">
                    {formatGbp(order.subtotalPence)}
                  </dd>
                </div>
              ) : null}
              {order.shippingPence != null ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    Delivery
                    {order.shippingMethodSnapshot?.name
                      ? ` · ${order.shippingMethodSnapshot.name}`
                      : ""}
                  </dt>
                  <dd className="tabular-nums">
                    {order.shippingPence === 0
                      ? "Free"
                      : formatGbp(order.shippingPence)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatGbp(total)}</dd>
              </div>
              {order.vatPence != null ? (
                <p className="text-xs text-muted-foreground">
                  Includes VAT of {formatGbp(order.vatPence)}
                </p>
              ) : null}
              {refunded > 0 ? (
                <>
                  <div className="flex justify-between pt-2 text-success">
                    <dt>Refunded</dt>
                    <dd className="tabular-nums">−{formatGbp(refunded)}</dd>
                  </div>
                  <div className="flex justify-between font-medium">
                    <dt>Net paid</dt>
                    <dd className="tabular-nums">
                      {formatGbp(total - refunded)}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {refunds.length ? (
              <ul className="mt-4 space-y-2 border-t border-border pt-4 text-xs">
                {refunds.map((refund) => (
                  <li key={refund.id} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {formatDate(refund.createdAt)} · {refund.reason}
                    </span>
                    <span className="tabular-nums">
                      {formatGbp(refund.amountPence)}
                    </span>
                  </li>
                ))}
                <li className="text-muted-foreground">
                  Refunds go back to the account you paid from and can take a
                  few working days.
                </li>
              </ul>
            ) : null}
          </Card>

          {order.shippingAddress ? (
            <Card title="Delivery address">
              <address className="text-sm not-italic leading-relaxed">
                {order.shippingAddress.fullName}
                <br />
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 ? (
                  <>
                    <br />
                    {order.shippingAddress.line2}
                  </>
                ) : null}
                <br />
                {order.shippingAddress.city}
                {order.shippingAddress.county
                  ? `, ${order.shippingAddress.county}`
                  : ""}
                <br />
                {order.shippingAddress.postcode}
              </address>
              {order.shippingMethodSnapshot?.etaMinDays ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {order.shippingMethodSnapshot.name} · usually{" "}
                  {order.shippingMethodSnapshot.etaMinDays}–
                  {order.shippingMethodSnapshot.etaMaxDays} working days after
                  dispatch
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card title="Need help?">
            <p className="text-sm text-muted-foreground">
              Reply to any email about this order and quote{" "}
              <strong className="text-foreground">{order.orderNumber}</strong>.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/account"
                className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary"
              >
                All orders
              </Link>
              <Link
                href="/shop"
                className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary"
              >
                Continue shopping
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
