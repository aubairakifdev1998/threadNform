export type Cart = {
  id: string;
  customerId: string | null;
  guestTokenHash: string | null;
  status: 'ACTIVE' | 'CONVERTED' | 'ABANDONED';
  currency: string;
};

export type CartItem = {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
};

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

export interface CartRepository {
  createGuestCart(guestTokenHash: string): Promise<Cart>;
  createCustomerCart(customerId: string): Promise<Cart>;
  findActiveByCustomer(customerId: string): Promise<Cart | null>;
  findByGuestTokenHash(hash: string): Promise<Cart | null>;
  findById(id: string): Promise<Cart | null>;
  /**
   * Row-locks the cart for the current transaction and returns it only if it
   * is ACTIVE. Serialises cart edits against checkout.
   */
  lockActive(id: string): Promise<Cart | null>;
  listItems(cartId: string): Promise<CartItem[]>;
  /** Adds `quantity` to the line for this variant, creating it if needed. */
  upsertItem(
    cartId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartItem>;
  updateItemQuantity(itemId: string, quantity: number): Promise<CartItem>;
  removeItem(itemId: string): Promise<void>;
  /** Atomically moves an ACTIVE cart to CONVERTED; false if it was not ACTIVE. */
  claimForCheckout(cartId: string): Promise<boolean>;
  markAbandoned(cartId: string): Promise<void>;
  /** Records cart activity (drives expiry of stock holds). */
  touch(cartId: string): Promise<void>;
  /** ACTIVE carts that still hold stock and had no activity since `before`. */
  listIdleActiveCartIds(before: Date, limit: number): Promise<string[]>;
}
