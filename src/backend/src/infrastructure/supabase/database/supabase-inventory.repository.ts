import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  InsufficientStockException,
  ValidationException,
} from '../../../domain/exceptions/domain.exception.js';
import type {
  InventoryItem,
  InventoryMovement,
  InventoryRepository,
  Warehouse,
} from '../../../domain/repositories/inventory.repository.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import {
  inventoryItems,
  inventoryMovements,
  productVariants,
  products,
  warehouses,
} from '../../drizzle/schema/index.js';

@Injectable()
export class SupabaseInventoryRepository implements InventoryRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listWarehouses(): Promise<Warehouse[]> {
    const rows = await this.db
      .select()
      .from(warehouses)
      .orderBy(warehouses.name);
    return rows.map((row) => this.mapWarehouse(row));
  }

  async getDefaultWarehouse(): Promise<Warehouse | null> {
    const [row] = await this.db
      .select()
      .from(warehouses)
      .where(eq(warehouses.isDefault, true))
      .limit(1);
    return row ? this.mapWarehouse(row) : null;
  }

  async createWarehouse(input: {
    code: string;
    name: string;
    isDefault?: boolean;
  }): Promise<Warehouse> {
    const [row] = await this.db
      .insert(warehouses)
      .values({
        code: input.code,
        name: input.name,
        isDefault: input.isDefault ?? false,
      })
      .returning();
    return this.mapWarehouse(row);
  }

  async getItem(
    warehouseId: string,
    variantId: string,
  ): Promise<InventoryItem | null> {
    const [row] = await this.db
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.warehouseId, warehouseId),
          eq(inventoryItems.variantId, variantId),
        ),
      )
      .limit(1);
    return row ? this.mapItem(row) : null;
  }

  async listItems(params: {
    page: number;
    pageSize: number;
    warehouseId?: string;
    lowStockOnly?: boolean;
  }): Promise<{ items: InventoryItem[]; total: number }> {
    const filters: SQL[] = [
      ne(productVariants.status, 'ARCHIVED'),
      ne(products.status, 'ARCHIVED'),
    ];
    if (params.warehouseId) {
      filters.push(eq(inventoryItems.warehouseId, params.warehouseId));
    }
    const where = and(...filters);
    const offset = (params.page - 1) * params.pageSize;

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({
          item: inventoryItems,
          sku: productVariants.sku,
          productId: products.id,
          productName: products.name,
          productSlug: products.slug,
        })
        .from(inventoryItems)
        .innerJoin(
          productVariants,
          eq(inventoryItems.variantId, productVariants.id),
        )
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(where)
        .orderBy(desc(inventoryItems.updatedAt))
        .limit(params.pageSize)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(inventoryItems)
        .innerJoin(
          productVariants,
          eq(inventoryItems.variantId, productVariants.id),
        )
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(where),
    ]);

    let items = rows.map((row) =>
      this.mapItem(row.item, {
        sku: row.sku,
        productId: row.productId,
        productName: row.productName,
        productSlug: row.productSlug,
      }),
    );
    if (params.lowStockOnly) {
      items = items.filter((i) => i.available <= 5);
    }
    return { items, total: totalRow?.value ?? items.length };
  }

  async adjust(input: {
    warehouseId: string;
    variantId: string;
    onHandDelta: number;
    movementType: string;
    actorType?: string;
    actorId?: string | null;
    reason?: string | null;
  }): Promise<InventoryItem> {
    return this.callInventoryRpc(
      sql`select * from public.adjust_inventory(
        ${input.warehouseId}::uuid,
        ${input.variantId}::uuid,
        ${input.onHandDelta}::int,
        ${input.movementType}::public.inventory_movement_type,
        ${input.actorType ?? 'ADMIN'}::public.actor_type,
        ${input.actorId ?? null}::uuid,
        ${input.reason ?? null}::text
      )`,
    );
  }

  async reserve(input: {
    warehouseId: string;
    variantId: string;
    qty: number;
    referenceType: string;
    referenceId: string;
    actorType?: string;
    actorId?: string | null;
  }): Promise<InventoryItem> {
    return this.callInventoryRpc(
      sql`select * from public.reserve_inventory(
        ${input.warehouseId}::uuid,
        ${input.variantId}::uuid,
        ${input.qty}::int,
        ${input.referenceType}::text,
        ${input.referenceId}::uuid,
        ${input.actorType ?? 'SYSTEM'}::public.actor_type,
        ${input.actorId ?? null}::uuid
      )`,
    );
  }

  async release(input: {
    warehouseId: string;
    variantId: string;
    qty: number;
    referenceType: string;
    referenceId: string;
    actorType?: string;
    actorId?: string | null;
    reason?: string | null;
  }): Promise<InventoryItem> {
    return this.callInventoryRpc(
      sql`select * from public.release_inventory(
        ${input.warehouseId}::uuid,
        ${input.variantId}::uuid,
        ${input.qty}::int,
        ${input.referenceType}::text,
        ${input.referenceId}::uuid,
        ${input.actorType ?? 'SYSTEM'}::public.actor_type,
        ${input.actorId ?? null}::uuid,
        ${input.reason ?? null}::text
      )`,
    );
  }

  async fulfill(input: {
    warehouseId: string;
    variantId: string;
    qty: number;
    referenceType: string;
    referenceId: string;
    actorType?: string;
    actorId?: string | null;
  }): Promise<InventoryItem> {
    return this.callInventoryRpc(
      sql`select * from public.fulfill_inventory(
        ${input.warehouseId}::uuid,
        ${input.variantId}::uuid,
        ${input.qty}::int,
        ${input.referenceType}::text,
        ${input.referenceId}::uuid,
        ${input.actorType ?? 'ADMIN'}::public.actor_type,
        ${input.actorId ?? null}::uuid
      )`,
    );
  }

  async listMovements(params: {
    page: number;
    pageSize: number;
    variantId?: string;
  }): Promise<{ items: InventoryMovement[]; total: number }> {
    const where = params.variantId
      ? eq(inventoryMovements.variantId, params.variantId)
      : undefined;
    const offset = (params.page - 1) * params.pageSize;
    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(inventoryMovements)
        .where(where)
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(params.pageSize)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(inventoryMovements)
        .where(where),
    ]);
    return {
      items: items.map((row) => this.mapMovement(row)),
      total: totalRow?.value ?? 0,
    };
  }

  async purgeVariantStock(input: {
    variantId: string;
    actorType?: string;
    actorId?: string | null;
    reason?: string;
  }): Promise<{ removed: number }> {
    const rows = await this.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.variantId, input.variantId));

    let removed = 0;
    for (const row of rows) {
      if (row.onHand !== 0 || row.reserved !== 0) {
        await this.db.insert(inventoryMovements).values({
          warehouseId: row.warehouseId,
          variantId: input.variantId,
          quantityDelta: -row.onHand,
          movementType: 'MANUAL_ADJUSTMENT',
          referenceType: 'PRODUCT_DELETE',
          referenceId: input.variantId,
          previousOnHand: row.onHand,
          newOnHand: 0,
          previousReserved: row.reserved,
          newReserved: 0,
          actorType: (input.actorType as 'ADMIN' | 'CUSTOMER' | 'SYSTEM') ?? 'ADMIN',
          actorId: input.actorId ?? null,
          reason:
            input.reason ??
            'Product/variant deleted — stock removed from sellable inventory',
        });
      }
      await this.db
        .delete(inventoryItems)
        .where(eq(inventoryItems.id, row.id));
      removed += 1;
    }
    return { removed };
  }

  private async callInventoryRpc(query: SQL): Promise<InventoryItem> {
    try {
      const result = await this.db.execute(query);
      const row = (result as unknown as { rows?: Record<string, unknown>[] })
        .rows?.[0] as Record<string, unknown> | undefined;
      if (!row) throw new ValidationException('Inventory RPC returned no row');
      return this.mapItemFromRpc(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.mapRpcError(message);
    }
  }

  private mapRpcError(message: string): never {
    if (message.includes('INSUFFICIENT_STOCK')) {
      const match = message.match(/available (\d+), requested (\d+)/);
      throw new InsufficientStockException(
        match ? Number(match[1]) : 0,
        match ? Number(match[2]) : 0,
      );
    }
    throw new ValidationException(message);
  }

  private mapWarehouse(row: typeof warehouses.$inferSelect): Warehouse {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      isDefault: row.isDefault,
    };
  }

  private mapItem(
    row: typeof inventoryItems.$inferSelect,
    extra?: {
      sku?: string | null;
      productId?: string | null;
      productName?: string | null;
      productSlug?: string | null;
    },
  ): InventoryItem {
    return {
      id: row.id,
      warehouseId: row.warehouseId,
      variantId: row.variantId,
      onHand: row.onHand,
      reserved: row.reserved,
      available: row.onHand - row.reserved,
      sku: extra?.sku ?? null,
      productId: extra?.productId ?? null,
      productName: extra?.productName ?? null,
      productSlug: extra?.productSlug ?? null,
    };
  }

  private mapItemFromRpc(row: Record<string, unknown>): InventoryItem {
    const onHand = Number(row.on_hand);
    const reserved = Number(row.reserved);
    return {
      id: String(row.id),
      warehouseId: String(row.warehouse_id),
      variantId: String(row.variant_id),
      onHand,
      reserved,
      available: onHand - reserved,
    };
  }

  private mapMovement(
    row: typeof inventoryMovements.$inferSelect,
  ): InventoryMovement {
    return {
      id: row.id,
      warehouseId: row.warehouseId,
      variantId: row.variantId,
      quantityDelta: row.quantityDelta,
      movementType: row.movementType,
      referenceType: row.referenceType ?? null,
      referenceId: row.referenceId ?? null,
      previousOnHand: row.previousOnHand,
      newOnHand: row.newOnHand,
      previousReserved: row.previousReserved,
      newReserved: row.newReserved,
      createdAt: row.createdAt,
    };
  }
}
