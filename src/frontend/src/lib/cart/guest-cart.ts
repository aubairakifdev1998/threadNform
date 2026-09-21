import { cartApi } from "@/lib/api";
import { guestCartStore } from "@/lib/auth/session";
import type { Cart } from "@/types/api";

export type GuestCartSession = {
  cartId: string;
  guestToken: string;
};

export async function ensureGuestCart(): Promise<GuestCartSession> {
  const existingId = guestCartStore.getCartId();
  const existingToken = guestCartStore.getGuestToken();

  if (existingId && existingToken) {
    try {
      await cartApi.get(existingId, existingToken);
      return { cartId: existingId, guestToken: existingToken };
    } catch {
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

export async function loadGuestCart(): Promise<Cart | null> {
  const cartId = guestCartStore.getCartId();
  const guestToken = guestCartStore.getGuestToken();
  if (!cartId || !guestToken) return null;
  try {
    return await cartApi.get(cartId, guestToken);
  } catch {
    guestCartStore.clear();
    return null;
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
  return cartApi.get(session.cartId, session.guestToken);
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
  return cartApi.get(session.cartId, session.guestToken);
}

export async function removeGuestCartItem(itemId: string): Promise<Cart | null> {
  const session = await ensureGuestCart();
  await cartApi.removeItem(session.cartId, itemId, session.guestToken);
  return cartApi.get(session.cartId, session.guestToken);
}
