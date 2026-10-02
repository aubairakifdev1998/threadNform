"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adminApi,
  type AdminRefund,
  type AdminShipment,
} from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { formatGbp } from "@/lib/money";

type Item = {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unitGrossPence: number;
  quantityShipped: number;
  quantityCancelled: number;
  quantityReturned: number;
};

const SHIPPABLE = new Set([
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
  "PARTIALLY_SHIPPED",
]);
const REFUNDABLE = new Set([
  "VERIFIED",
  "PARTIALLY_REFUNDED",
  "REFUND_PENDING",
]);

const outstanding = (i: Item) =>
  i.quantity - i.quantityShipped - i.quantityCancelled;
const refundableUnits = (i: Item) =>
  outstanding(i) + i.quantityShipped - i.quantityReturned;

function newKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random()}`;
}

/** Whole-number field limited to 0..max. */
function QtyInput({
  id,
  value,
  max,
  onChange,
  disabled,
}: {
  id: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      value={value}
      disabled={disabled || max === 0}
      onChange={(e) => {
        const n = Math.floor(Number(e.target.value));
        onChange(Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0);
      }}
      className="h-8 w-16 text-right tabular-nums"
    />
  );
}

export function AdminOrderFulfilment({
  orderId,
  orderStatus,
  paymentStatus,
  grandTotalPence,
  refundedPence,
  items,
  shipments,
  refunds,
  canRefund,
  onChanged,
}: {
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  grandTotalPence: number;
  refundedPence: number;
  items: Item[];
  shipments: AdminShipment[];
  refunds: AdminRefund[];
  canRefund: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [shipQty, setShipQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((i) => [i.id, outstanding(i)])),
  );
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [refundQty, setRefundQty] = useState<Record<string, number>>({});
  const [noRestock, setNoRestock] = useState<Record<string, boolean>>({});
  const [refundPounds, setRefundPounds] = useState("");
  const [refundReason, setRefundReason] = useState("");
  // One key per form submission attempt: retries replay, never duplicate.
  const [shipKey, setShipKey] = useState(newKey);
  const [refundKey, setRefundKey] = useState(newKey);
  const [busy, setBusy] = useState<"ship" | "refund" | null>(null);

  const remainingRefundable = grandTotalPence - refundedPence;
  const canShip =
    SHIPPABLE.has(orderStatus) && items.some((i) => outstanding(i) > 0);
  const refundOpen =
    canRefund && REFUNDABLE.has(paymentStatus) && remainingRefundable > 0;
  const itemName = (id: string) => {
    const item = items.find((i) => i.id === id);
    return item ? `${item.productName} (${item.sku})` : "Item";
  };

  const suggestedRefund = items.reduce(
    (sum, i) => sum + (refundQty[i.id] ?? 0) * i.unitGrossPence,
    0,
  );

  async function ship() {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    const lines = items
      .map((i) => ({ orderItemId: i.id, quantity: shipQty[i.id] ?? 0 }))
      .filter((l) => l.quantity > 0);
    if (!lines.length) {
      toast.error("Choose at least one unit to ship");
      return;
    }
    setBusy("ship");
    try {
      await adminApi.createShipment(
        token,
        orderId,
        {
          items: lines,
          carrier: carrier.trim() || undefined,
          trackingNumber: trackingNumber.trim() || undefined,
          trackingUrl: trackingUrl.trim() || undefined,
        },
        shipKey,
      );
      toast.success("Shipment recorded — stock deducted, customer emailed");
      setShipKey(newKey());
      setCarrier("");
      setTrackingNumber("");
      setTrackingUrl("");
      await onChanged();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Shipment failed",
      );
    } finally {
      setBusy(null);
    }
  }

  async function refund() {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    const amountPence = Math.round(Number(refundPounds) * 100);
    if (!Number.isFinite(amountPence) || amountPence <= 0) {
      toast.error("Enter the amount to refund");
      return;
    }
    if (amountPence > remainingRefundable) {
      toast.error(`At most ${formatGbp(remainingRefundable)} can be refunded`);
      return;
    }
    if (refundReason.trim().length < 3) {
      toast.error("Give a reason for the refund");
      return;
    }
    const lines = items
      .map((i) => ({
        orderItemId: i.id,
        quantity: refundQty[i.id] ?? 0,
        restock: !noRestock[i.id],
      }))
      .filter((l) => l.quantity > 0);
    if (
      !window.confirm(
        `Record a refund of ${formatGbp(amountPence)}? Make the bank transfer to the customer separately.`,
      )
    ) {
      return;
    }
    setBusy("refund");
    try {
      await adminApi.createRefund(
        token,
        orderId,
        {
          amountPence,
          reason: refundReason.trim(),
          items: lines.length ? lines : undefined,
        },
        refundKey,
      );
      toast.success("Refund recorded — customer emailed");
      setRefundKey(newKey());
      setRefundQty({});
      setNoRestock({});
      setRefundPounds("");
      setRefundReason("");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Refund failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Fulfilment</h3>
        <ul className="divide-y divide-border border border-border text-sm">
          {items.map((item) => (
            <li key={item.id} className="space-y-1 px-3 py-2">
              <div className="flex justify-between gap-3">
                <span className="font-medium">
                  {item.productName}{" "}
                  <span className="text-muted-foreground">· {item.sku}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  × {item.quantity}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Shipped {item.quantityShipped} · Cancelled{" "}
                {item.quantityCancelled} · Returned {item.quantityReturned} · To
                ship {outstanding(item)}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {canShip ? (
        <div className="space-y-3 border border-border p-3">
          <h4 className="text-sm font-medium">Ship items</h4>
          {items
            .filter((i) => outstanding(i) > 0)
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <Label htmlFor={`ship-${item.id}`} className="font-normal">
                  {item.productName} ({outstanding(item)} left)
                </Label>
                <QtyInput
                  id={`ship-${item.id}`}
                  value={shipQty[item.id] ?? 0}
                  max={outstanding(item)}
                  onChange={(n) =>
                    setShipQty((prev) => ({ ...prev, [item.id]: n }))
                  }
                />
              </div>
            ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            />
            <Input
              placeholder="Tracking number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
            <Input
              className="sm:col-span-2"
              placeholder="Tracking URL (https://…)"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
            />
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void ship()}
          >
            {busy === "ship" ? "Recording…" : "Record shipment"}
          </Button>
        </div>
      ) : null}

      {refundOpen ? (
        <div className="space-y-3 border border-border p-3">
          <div className="flex items-baseline justify-between">
            <h4 className="text-sm font-medium">Refund</h4>
            <span className="text-xs text-muted-foreground">
              Refundable {formatGbp(remainingRefundable)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Optional: choose units being refunded. Unshipped units are cancelled
            and their stock released; shipped units are restocked unless marked
            damaged.
          </p>
          {items
            .filter((i) => refundableUnits(i) > 0)
            .map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <Label htmlFor={`refund-${item.id}`} className="font-normal">
                  {item.productName} ({refundableUnits(item)} refundable)
                </Label>
                <div className="flex items-center gap-3">
                  {item.quantityShipped - item.quantityReturned > 0 ? (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={Boolean(noRestock[item.id])}
                        onChange={(e) =>
                          setNoRestock((prev) => ({
                            ...prev,
                            [item.id]: e.target.checked,
                          }))
                        }
                      />
                      Damaged
                    </label>
                  ) : null}
                  <QtyInput
                    id={`refund-${item.id}`}
                    value={refundQty[item.id] ?? 0}
                    max={refundableUnits(item)}
                    onChange={(n) =>
                      setRefundQty((prev) => ({ ...prev, [item.id]: n }))
                    }
                  />
                </div>
              </div>
            ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="refund-amount">Amount (£)</Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                placeholder={
                  suggestedRefund ? (suggestedRefund / 100).toFixed(2) : "0.00"
                }
                value={refundPounds}
                onChange={(e) => setRefundPounds(e.target.value)}
              />
              {suggestedRefund ? (
                <button
                  type="button"
                  className="text-xs underline underline-offset-2"
                  onClick={() =>
                    setRefundPounds(
                      (
                        Math.min(suggestedRefund, remainingRefundable) / 100
                      ).toFixed(2),
                    )
                  }
                >
                  Use item value{" "}
                  {formatGbp(Math.min(suggestedRefund, remainingRefundable))}
                </button>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="refund-reason">Reason</Label>
              <Input
                id="refund-reason"
                placeholder="e.g. Out of stock, returned"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void refund()}
          >
            {busy === "refund" ? "Recording…" : "Record refund"}
          </Button>
        </div>
      ) : null}

      {shipments.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Shipments</h3>
          <ul className="divide-y divide-border border border-border text-xs">
            {shipments.map((s) => (
              <li key={s.id} className="space-y-1 px-3 py-2">
                <p className="font-medium">
                  {new Date(s.shippedAt).toLocaleString("en-GB")}
                  {s.carrier ? ` · ${s.carrier}` : ""}
                  {s.trackingNumber ? ` · ${s.trackingNumber}` : ""}
                </p>
                <p className="text-muted-foreground">
                  {s.items
                    .map((i) => `${itemName(i.orderItemId)} × ${i.quantity}`)
                    .join(", ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {refunds.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Refunds · {formatGbp(refundedPence)} of {formatGbp(grandTotalPence)}
          </h3>
          <ul className="divide-y divide-border border border-border text-xs">
            {refunds.map((r) => (
              <li key={r.id} className="space-y-1 px-3 py-2">
                <p className="font-medium">
                  {formatGbp(r.amountPence)} ·{" "}
                  {new Date(r.createdAt).toLocaleString("en-GB")}
                </p>
                <p className="text-muted-foreground">{r.reason}</p>
                {r.items.length ? (
                  <p className="text-muted-foreground">
                    {r.items
                      .map(
                        (i) =>
                          `${itemName(i.orderItemId)}: ${
                            i.quantityCancelled
                              ? `${i.quantityCancelled} cancelled `
                              : ""
                          }${i.quantityReturned ? `${i.quantityReturned} returned${i.restocked ? " (restocked)" : ""}` : ""}`,
                      )
                      .join("; ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
