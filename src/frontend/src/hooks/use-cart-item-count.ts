"use client";

import { useEffect, useState } from "react";
import {
  CART_UPDATED_EVENT,
  cartItemCount,
  loadGuestCart,
} from "@/lib/cart/guest-cart";

/**
 * Live bag count for the storefront header. Reads the guest cart once, then
 * stays in sync via the mutation event rather than polling.
 */
export function useCartItemCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void loadGuestCart()
      .then((cart) => {
        if (!cancelled) setCount(cartItemCount(cart));
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });

    function onUpdate(event: Event) {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      if (typeof detail?.count === "number") {
        setCount(detail.count);
      }
    }

    window.addEventListener(CART_UPDATED_EVENT, onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(CART_UPDATED_EVENT, onUpdate);
    };
  }, []);

  return count;
}
