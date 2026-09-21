export type Warehouse = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
};

export type InventoryItem = {
  id: string;
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
  sku?: string | null;
  productId?: string | null;
  productName?: string | null;
  productSlug?: string | null;
};

export type InventoryMovement = {
  id: string;
  warehouseId: string;
  variantId: string;
  quantityDelta: number;
  movementType: string;
  referenceType: string | null;
  referenceId: string | null;
  previousOnHand: number;
  newOnHand: number;
  previousReserved: number;
  newReserved: number;
  createdAt: Date;
};

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');

export interface InventoryRepository {
  listWarehouses(): Promise<Warehouse[]>;
  getDefaultWarehouse(): Promise<Warehouse | null>;
  createWarehouse(input: {
    code: string;
    name: string;
    isDefault?: boolean;
  }): Promise<Warehouse>;
  getItem(warehouseId: string, variantId: string): Promise<InventoryItem | null>;
  listItems(params: {
    page: number;
    pageSize: number;
    warehouseId?: string;
    lowStockOnly?: boolean;
  }): Promise<{ items: InventoryItem[]; total: number }>;
  adjust(input: {
    warehouseId: string;
    variantId: string;
    onHandDelta: number;
    movementType: string;
    actorType?: string;
    actorId?: string | null;
    reason?: string | null;
  }): Promise<InventoryItem>;
  reserve(input: {
    warehouseId: string;
    variantId: string;
    qty: number;
    referenceType: string;
    referenceId: string;
    actorType?: string;
    actorId?: string | null;
  }): Promise<InventoryItem>;
  release(input: {
    warehouseId: string;
    variantId: string;
    qty: number;
    referenceType: string;
    referenceId: string;
    actorType?: string;
    actorId?: string | null;
    reason?: string | null;
  }): Promise<InventoryItem>;
  fulfill(input: {
    warehouseId: string;
    variantId: string;
    qty: number;
    referenceType: string;
    referenceId: string;
    actorType?: string;
    actorId?: string | null;
  }): Promise<InventoryItem>;
  listMovements(params: {
    page: number;
    pageSize: number;
    variantId?: string;
  }): Promise<{ items: InventoryMovement[]; total: number }>;
  /** Zero + remove stock rows for a variant (keeps movement history). */
  purgeVariantStock(input: {
    variantId: string;
    actorType?: string;
    actorId?: string | null;
    reason?: string;
  }): Promise<{ removed: number }>;
}
