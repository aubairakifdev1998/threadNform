import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { guestCartStore } from "@/lib/auth/session";
import {
  CART_UPDATED_EVENT,
  cartItemCount,
  MAX_CART_LINE_QUANTITY,
  notifyCartUpdated,
} from "./guest-cart";
import type { Cart } from "@/types/api";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

describe("guest cart helpers", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: memoryStorage(),
    });
  });

  afterEach(() => {
    guestCartStore.clear();
    vi.restoreAllMocks();
  });

  it("sums line quantities and treats missing cart as zero", () => {
    expect(cartItemCount(null)).toBe(0);
    expect(
      cartItemCount({
        items: [{ quantity: 2 }, { quantity: 3 }],
      } as Cart),
    ).toBe(5);
  });

  it("exposes the per-line quantity cap", () => {
    expect(MAX_CART_LINE_QUANTITY).toBe(99);
  });

  it("dispatches a cart-updated event with the item count", () => {
    const handler = vi.fn();
    window.addEventListener(CART_UPDATED_EVENT, handler);
    notifyCartUpdated({
      items: [{ quantity: 4 }],
    } as Cart);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ count: 4 });
    window.removeEventListener(CART_UPDATED_EVENT, handler);
  });

  it("persists and clears guest cart session keys", () => {
    guestCartStore.set("cart-1", "token-1");
    expect(guestCartStore.getCartId()).toBe("cart-1");
    expect(guestCartStore.getGuestToken()).toBe("token-1");
    guestCartStore.clear();
    expect(guestCartStore.getCartId()).toBeNull();
  });

  it("ApiError status codes used for cart-gone detection", () => {
    expect(
      new ApiError("gone", { code: "NOT_FOUND", status: 404 }).status,
    ).toBe(404);
    expect(
      new ApiError("auth", { code: "UNAUTHORIZED", status: 401 }).status,
    ).toBe(401);
  });
});
