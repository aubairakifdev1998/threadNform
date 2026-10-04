"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import {
  Card,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriceDisplay } from "@/components/ui/price";
import { StatusBadge } from "@/components/ui/status-badge";
import { MAX_CART_LINE_QUANTITY } from "@/lib/cart/guest-cart";
import type { CartItem } from "@/types/api";
import { cn } from "@/lib/utils";

type ShoppingCartOneProps = {
  item: CartItem;
  busy?: boolean;
  onChangeQty: (itemId: string, quantity: number) => Promise<void>;
  onRemove: (itemId: string, name: string) => Promise<void>;
  className?: string;
};

/** CommerCN cart-01 line item, wired to Fareya guest/auth cart lines. */
export function ShoppingCartOne({
  item,
  busy = false,
  onChangeQty,
  onRemove,
  className,
}: ShoppingCartOneProps) {
  const name = item.productName ?? item.sku ?? "Item";
  const unavailable = item.purchasable === false;
  const shortStock = !unavailable && item.inStock === false;
  const atMax =
    item.quantity >= MAX_CART_LINE_QUANTITY ||
    unavailable ||
    (item.availableQuantity !== undefined &&
      item.quantity >= item.availableQuantity);

  return (
    <Card
      className={cn(
        "flex w-full flex-row gap-4 rounded-xl border-0 bg-muted p-4 shadow-none",
        className,
      )}
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-background">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col space-y-3">
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            {item.sku ? (
              <CardDescription className="text-xs">{item.sku}</CardDescription>
            ) : null}
            <CardTitle className="text-base leading-snug font-semibold">
              {item.productSlug ? (
                <Link
                  href={`/products/${item.productSlug}`}
                  className="underline-offset-4 hover:underline"
                >
                  {name}
                </Link>
              ) : (
                name
              )}
            </CardTitle>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={busy}
            aria-label={`Remove ${name}`}
            onClick={() => void onRemove(item.id, name)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        {unavailable ? (
          <StatusBadge tone="danger">No longer available</StatusBadge>
        ) : shortStock ? (
          <StatusBadge tone="warning">
            {item.availableQuantity
              ? `Only ${item.availableQuantity} left`
              : "Out of stock"}
          </StatusBadge>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center rounded-lg border border-border bg-background">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Decrease quantity of ${name}`}
              disabled={busy || item.quantity <= 1}
              onClick={() =>
                void onChangeQty(item.id, Math.max(1, item.quantity - 1))
              }
            >
              <Minus className="size-4" />
            </Button>
            <span
              className="w-8 text-center text-sm font-medium"
              aria-live="polite"
            >
              {item.quantity}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Increase quantity of ${name}`}
              disabled={busy || atMax}
              onClick={() => void onChangeQty(item.id, item.quantity + 1)}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          <PriceDisplay
            pence={(item.unitPricePence ?? 0) * item.quantity}
            size="md"
          />
        </div>
      </div>
    </Card>
  );
}
