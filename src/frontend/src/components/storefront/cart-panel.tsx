"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ShoppingBag, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ShoppingCartOne } from "@/components/commercn/carts/cart-01";
import { Section } from "@/components/layout/section";
import { PriceDisplay } from "@/components/ui/price";
import { EmptyState, ErrorState } from "@/components/ui/data-states";
import {
  loadGuestCart,
  removeGuestCartItem,
  updateGuestCartItem,
} from "@/lib/cart/guest-cart";
import { guestCartStore } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { CartShimmer } from "@/components/ui/page-shimmers";
import { ApiError } from "@/lib/api/client";
import type { Cart } from "@/types/api";

export function CartPanel() {
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setCart(await loadGuestCart());
    } catch (error) {
      // The bag may well still have items — say so rather than showing "empty".
      setLoadError(error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadGuestCart();
        if (!cancelled) setCart(data);
      } catch (error) {
        if (!cancelled) setLoadError(error);
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
    if (!window.confirm("Remove everything from your bag?")) return;
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
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function removeLine(itemId: string, name: string) {
    setBusyId(itemId);
    try {
      const next = await removeGuestCartItem(itemId);
      setCart(next);
      toast.success(`${name} removed`);
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
      // Show the server's view (e.g. stock changed) rather than a stale one.
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <CartShimmer />;

  if (loadError) {
    return (
      <Section width="narrow" space="loose">
        <h1 className="heading-display text-3xl sm:text-4xl">Your bag</h1>
        <div className="mt-8 rounded-lg border border-border bg-card">
          <ErrorState
            error={loadError}
            onRetry={() => void load()}
            description="We couldn't load your bag just now. Nothing has been removed — try again in a moment."
          />
        </div>
      </Section>
    );
  }

  const items = cart?.items ?? [];

  if (items.length === 0) {
    return (
      <Section width="narrow" space="loose">
        <h1 className="heading-display text-3xl sm:text-4xl">Your bag</h1>
        <div className="mt-8 rounded-lg border border-dashed border-border bg-card">
          <EmptyState
            icon={ShoppingBag}
            title="Your bag is empty"
            description="Once you add something it will be held here, with stock reserved while you check out."
            action={
              <Link href="/shop" className={cn(buttonVariants({ size: "lg" }))}>
                Start shopping
              </Link>
            }
          />
        </div>
      </Section>
    );
  }

  const subtotal =
    cart?.subtotalPence ??
    items.reduce(
      (sum, item) => sum + (item.unitPricePence ?? 0) * item.quantity,
      0,
    );
  const blockedLines = items.filter((item) => item.inStock === false);
  const blocked = blockedLines.length > 0;

  return (
    <Section width="narrow" space="loose" className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading-display text-3xl sm:text-4xl">Your bag</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} · stock held while
            you check out
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busyId === "clear"}
          onClick={() => void clearBag()}
        >
          <Trash2 aria-hidden />
          Clear bag
        </Button>
      </div>

      {blocked ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
          role="alert"
        >
          <p className="font-medium">
            {blockedLines.length === 1
              ? "One item needs attention"
              : `${blockedLines.length} items need attention`}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Stock changed while these were in your bag. Adjust or remove them to
            continue to checkout.
          </p>
        </div>
      ) : null}

      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <ShoppingCartOne
              item={item}
              busy={busyId === item.id}
              onChangeQty={changeQty}
              onRemove={removeLine}
            />
          </li>
        ))}
      </ul>

      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <PriceDisplay pence={subtotal} size="lg" />
        </div>
        <p className="text-xs text-muted-foreground">
          Delivery is calculated at checkout. VAT is included in the prices
          shown.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {blocked ? (
            <Button
              type="button"
              size="lg"
              disabled
              className="w-full sm:w-auto"
              aria-describedby="checkout-blocked"
            >
              Continue to checkout
            </Button>
          ) : (
            <Link
              href="/checkout"
              className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
            >
              Continue to checkout
            </Link>
          )}
          <Link
            href="/shop"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full sm:w-auto",
            )}
          >
            Keep shopping
          </Link>
        </div>
        {blocked ? (
          <p id="checkout-blocked" className="text-xs text-destructive">
            Resolve the items flagged above to continue.
          </p>
        ) : null}
      </div>
    </Section>
  );
}

