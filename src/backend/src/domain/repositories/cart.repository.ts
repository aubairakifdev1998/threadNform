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
  listItems(cartId: string): Promise<CartItem[]>;
  upsertItem(cartId: string, variantId: string, quantity: number): Promise<CartItem>;
  updateItemQuantity(itemId: string, quantity: number): Promise<CartItem>;
  removeItem(itemId: string): Promise<void>;
  markConverted(cartId: string): Promise<void>;
  mergeCarts(guestCartId: string, customerCartId: string): Promise<Cart>;
}
