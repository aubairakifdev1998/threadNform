import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type {
  Cart,
  CartItem,
  CartRepository,
} from '../../../domain/repositories/cart.repository.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import { cartItems, carts } from '../../drizzle/schema/index.js';

@Injectable()
export class SupabaseCartRepository implements CartRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async createGuestCart(guestTokenHash: string): Promise<Cart> {
    const [row] = await this.db
      .insert(carts)
      .values({ guestTokenHash, status: 'ACTIVE' })
      .returning();
    return this.mapCart(row);
  }

  async createCustomerCart(customerId: string): Promise<Cart> {
    const [row] = await this.db
      .insert(carts)
      .values({ customerId, status: 'ACTIVE' })
      .returning();
    return this.mapCart(row);
  }

  async findActiveByCustomer(customerId: string): Promise<Cart | null> {
    const [row] = await this.db
      .select()
      .from(carts)
      .where(and(eq(carts.customerId, customerId), eq(carts.status, 'ACTIVE')))
      .limit(1);
    return row ? this.mapCart(row) : null;
  }

  async findByGuestTokenHash(hash: string): Promise<Cart | null> {
    const [row] = await this.db
      .select()
      .from(carts)
      .where(and(eq(carts.guestTokenHash, hash), eq(carts.status, 'ACTIVE')))
      .limit(1);
    return row ? this.mapCart(row) : null;
  }

  async findById(id: string): Promise<Cart | null> {
    const [row] = await this.db
      .select()
      .from(carts)
      .where(eq(carts.id, id))
      .limit(1);
    return row ? this.mapCart(row) : null;
  }

  async listItems(cartId: string): Promise<CartItem[]> {
    const rows = await this.db
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, cartId));
    return rows.map((row) => this.mapItem(row));
  }

  async upsertItem(
    cartId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartItem> {
    const [existing] = await this.db
      .select()
      .from(cartItems)
      .where(
        and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)),
      )
      .limit(1);

    if (existing) {
      const [row] = await this.db
        .update(cartItems)
        .set({
          quantity: existing.quantity + quantity,
          updatedAt: new Date(),
        })
        .where(eq(cartItems.id, existing.id))
        .returning();
      return this.mapItem(row);
    }

    const [row] = await this.db
      .insert(cartItems)
      .values({ cartId, variantId, quantity })
      .returning();
    return this.mapItem(row);
  }

  async updateItemQuantity(itemId: string, quantity: number): Promise<CartItem> {
    const [row] = await this.db
      .update(cartItems)
      .set({ quantity, updatedAt: new Date() })
      .where(eq(cartItems.id, itemId))
      .returning();
    return this.mapItem(row);
  }

  async removeItem(itemId: string): Promise<void> {
    await this.db.delete(cartItems).where(eq(cartItems.id, itemId));
  }

  async markConverted(cartId: string): Promise<void> {
    await this.db
      .update(carts)
      .set({ status: 'CONVERTED', updatedAt: new Date() })
      .where(eq(carts.id, cartId));
  }

  async mergeCarts(guestCartId: string, customerCartId: string): Promise<Cart> {
    const guestItems = await this.listItems(guestCartId);
    for (const item of guestItems) {
      await this.upsertItem(customerCartId, item.variantId, item.quantity);
    }
    await this.db
      .update(carts)
      .set({ status: 'ABANDONED', updatedAt: new Date() })
      .where(eq(carts.id, guestCartId));
    const cart = await this.findById(customerCartId);
    if (!cart) throw new Error('Customer cart missing after merge');
    return cart;
  }

  private mapCart(row: typeof carts.$inferSelect): Cart {
    return {
      id: row.id,
      customerId: row.customerId ?? null,
      guestTokenHash: row.guestTokenHash ?? null,
      status: row.status as Cart['status'],
      currency: row.currency,
    };
  }

  private mapItem(row: typeof cartItems.$inferSelect): CartItem {
    return {
      id: row.id,
      cartId: row.cartId,
      variantId: row.variantId,
      quantity: row.quantity,
    };
  }
}
