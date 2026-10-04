import { cartApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { guestCartStore } from "@/lib/auth/session";
import type { Cart } from "@/types/api";

/** Header badge and other surfaces listen for this after a cart mutation. */
export const CART_UPDATED_EVENT = "fareya:cart-updated";

export function cartItemCount(cart: Cart | null | undefined): number {
  return cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
}

export function notifyCartUpdated(cart?: Cart | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CART_UPDATED_EVENT, {
      detail: { count: cartItemCount(cart) },
    }),
  );
}

/** Matches the API's per-line cap. */
export const MAX_CART_LINE_QUANTITY = 99;

export type GuestCartSession = {
  cartId: string;
  guestToken: string;
};

/**
 * Whether a failed cart read means the cart is really gone, as opposed to the
 * request not getting through. Only the former may discard the stored token —
 * clearing it on a network blip or a 500 throws away the customer's basket.
 */
function cartIsGone(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.status === 401 || error.status === 403)
  );
}

export async function ensureGuestCart(): Promise<GuestCartSession> {
  const existingId = guestCartStore.getCartId();
  const existingToken = guestCartStore.getGuestToken();

  if (existingId && existingToken) {
    try {
      await cartApi.get(existingId, existingToken);
      return { cartId: existingId, guestToken: existingToken };
    } catch (error) {
      if (!cartIsGone(error)) throw error;
      guestCartStore.clear();
    }
  }

  const created = await cartApi.create();
  guestCartStore.set(created.id, created.guestToken ?? "");
  if (!created.guestToken) {
    throw new Error("Cart created without guest token");
  }
  return { cartId: created.id, guestToken: created.guestToken };
}

/**
 * Returns null only when there is genuinely no cart. A failed request throws,
 * so the caller can show an error instead of an empty basket.
 */
export async function loadGuestCart(): Promise<Cart | null> {
  const cartId = guestCartStore.getCartId();
  const guestToken = guestCartStore.getGuestToken();
  if (!cartId || !guestToken) return null;
  try {
    return await cartApi.get(cartId, guestToken);
  } catch (error) {
    if (cartIsGone(error)) {
      guestCartStore.clear();
      return null;
    }
    throw error;
  }
}

export async function addVariantToGuestCart(
  variantId: string,
  quantity = 1,
): Promise<Cart> {
  const session = await ensureGuestCart();
  await cartApi.addItem(
    session.cartId,
    { variantId, quantity },
    session.guestToken,
  );
  const cart = await cartApi.get(session.cartId, session.guestToken);
  notifyCartUpdated(cart);
  return cart;
}

export async function updateGuestCartItem(
  itemId: string,
  quantity: number,
): Promise<Cart | null> {
  const session = await ensureGuestCart();
  if (quantity <= 0) {
    await cartApi.removeItem(session.cartId, itemId, session.guestToken);
  } else {
    await cartApi.updateItem(
      session.cartId,
      itemId,
      quantity,
      session.guestToken,
    );
  }
  const cart = await cartApi.get(session.cartId, session.guestToken);
  notifyCartUpdated(cart);
  return cart;
}

export async function removeGuestCartItem(itemId: string): Promise<Cart | null> {
  const session = await ensureGuestCart();
  await cartApi.removeItem(session.cartId, itemId, session.guestToken);
  const cart = await cartApi.get(session.cartId, session.guestToken);
  notifyCartUpdated(cart);
  return cart;
}
