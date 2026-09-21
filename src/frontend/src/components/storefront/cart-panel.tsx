"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  loadGuestCart,
  removeGuestCartItem,
  updateGuestCartItem,
} from "@/lib/cart/guest-cart";
import { guestCartStore } from "@/lib/auth/session";
import { formatGbp } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CartShimmer } from "@/components/ui/page-shimmers";
import { ApiError } from "@/lib/api/client";
import type { Cart } from "@/types/api";

export function CartPanel() {
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Cart | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await loadGuestCart();
      setCart(data);
    } catch {
      setCart(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadGuestCart();
        if (!cancelled) setCart(data);
      } catch {
        if (!cancelled) setCart(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function clearBag() {
    const items = cart?.items ?? [];
    setBusyId("clear");
    try {
      for (const item of items) {
        if (!item.id) continue;
        await removeGuestCartItem(item.id);
      }
      guestCartStore.clear();
      setCart(null);
      toast.success("Bag cleared — stock holds released");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not clear bag",
      );
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function removeLine(itemId: string) {
    setBusyId(itemId);
    try {
      const next = await removeGuestCartItem(itemId);
      setCart(next);
      toast.success("Item removed");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not remove item",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function changeQty(itemId: string, quantity: number) {
    setBusyId(itemId);
    try {
      const next = await updateGuestCartItem(itemId, quantity);
      setCart(next);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Stock update failed",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <CartShimmer />;
  }

  const items = cart?.items ?? [];

  if (!cart || items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-semibold">Your cart</h1>
        <div className="mt-10 rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Your cart is empty.</p>
          <Link
            href="/shop"
            className={cn(buttonVariants({ className: "mt-6" }))}
          >
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  const subtotal =
    cart.subtotalPence ??
    items.reduce(
      (sum, item) => sum + (item.unitPricePence ?? 0) * item.quantity,
      0,
    );

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold">Your cart</h1>
        <Button
          type="button"
          variant="outline"
          disabled={busyId === "clear"}
          onClick={() => void clearBag()}
        >
          Clear
        </Button>
      </div>

      <ul className="divide-y divide-border border border-border">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
          >
            <div>
              <p className="font-medium">
                {item.productName ?? item.sku ?? "Item"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.sku ? `${item.sku} · ` : ""}
                stock-linked line
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === item.id || item.quantity <= 1}
                  onClick={() =>
                    void changeQty(item.id, Math.max(1, item.quantity - 1))
                  }
                >
                  −
                </Button>
                <span className="min-w-6 text-center text-sm tabular-nums">
                  {item.quantity}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === item.id}
                  onClick={() => void changeQty(item.id, item.quantity + 1)}
                >
                  +
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busyId === item.id}
                  onClick={() => void removeLine(item.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
            <p className="text-sm tabular-nums">
              {formatGbp((item.unitPricePence ?? 0) * item.quantity)}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="text-base font-semibold tabular-nums">
          {formatGbp(subtotal)}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/checkout" className={cn(buttonVariants())}>
          Checkout
        </Link>
        <Link
          href="/shop"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
