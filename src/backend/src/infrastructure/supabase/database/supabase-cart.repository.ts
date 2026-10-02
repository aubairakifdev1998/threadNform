import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
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

  async lockActive(id: string): Promise<Cart | null> {
    const [row] = await this.db
      .select()
      .from(carts)
      .where(and(eq(carts.id, id), eq(carts.status, 'ACTIVE')))
      .limit(1)
      .for('update');
    return row ? this.mapCart(row) : null;
  }

  async listItems(cartId: string): Promise<CartItem[]> {
    const rows = await this.db
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, cartId))
      .orderBy(asc(cartItems.createdAt));
    return rows.map((row) => this.mapItem(row));
  }

  async upsertItem(
    cartId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartItem> {
    const [row] = await this.db
      .insert(cartItems)
      .values({ cartId, variantId, quantity })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.variantId],
        set: {
          quantity: sql`${cartItems.quantity} + excluded.quantity`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return this.mapItem(row);
  }

  async updateItemQuantity(
    itemId: string,
    quantity: number,
  ): Promise<CartItem> {
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

  async claimForCheckout(cartId: string): Promise<boolean> {
    const rows = await this.db
      .update(carts)
      .set({ status: 'CONVERTED', updatedAt: new Date() })
      .where(and(eq(carts.id, cartId), eq(carts.status, 'ACTIVE')))
      .returning({ id: carts.id });
    return rows.length > 0;
  }

  async markAbandoned(cartId: string): Promise<void> {
    await this.db
      .update(carts)
      .set({ status: 'ABANDONED', updatedAt: new Date() })
      .where(eq(carts.id, cartId));
  }

  async touch(cartId: string): Promise<void> {
    await this.db
      .update(carts)
      .set({ updatedAt: new Date() })
      .where(eq(carts.id, cartId));
  }

  async listIdleActiveCartIds(before: Date, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: carts.id })
      .from(carts)
      .where(
        and(
          eq(carts.status, 'ACTIVE'),
          lt(carts.updatedAt, before),
          // Only carts that still hold stock, so released carts drop out.
          sql`exists (
            select 1 from public.inventory_movements m
            where m.reference_type = 'CART' and m.reference_id = ${carts.id}
              and m.movement_type in ('ORDER_RESERVATION', 'ORDER_RELEASE', 'ORDER_FULFILLMENT')
            group by m.warehouse_id, m.variant_id
            having sum(m.quantity_delta) > 0
          )`,
        ),
      )
      .orderBy(asc(carts.updatedAt))
      .limit(limit);
    return rows.map((row) => row.id);
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
