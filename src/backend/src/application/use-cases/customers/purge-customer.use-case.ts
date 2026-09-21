import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import {
  NotFoundException,
  ValidationException,
} from '../../../domain/exceptions/domain.exception.js';
import {
  CART_REPOSITORY,
  type CartRepository,
} from '../../../domain/repositories/cart.repository.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
} from '../../../domain/repositories/commerce.repository.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../../../domain/repositories/customer.repository.js';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../../domain/repositories/inventory.repository.js';
import { isCancellable } from '../../../domain/orders/order-status.js';
import { DRIZZLE, type DrizzleDB } from '../../../infrastructure/drizzle/drizzle.tokens.js';
import {
  carts,
  customerAddresses,
  customers,
} from '../../../infrastructure/drizzle/schema/index.js';
import { SUPABASE_ADMIN_CLIENT } from '../../../infrastructure/supabase/supabase.tokens.js';
import { CancelOrderUseCase } from '../orders/order-lifecycle.use-cases.js';

@Injectable()
export class PurgeCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customersRepo: CustomerRepository,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(CART_REPOSITORY) private readonly cartsRepo: CartRepository,
    @Inject(INVENTORY_REPOSITORY) private readonly inventory: InventoryRepository,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
    private readonly cancelOrder: CancelOrderUseCase,
  ) {}

  async execute(input: {
    customerId: string;
    adminId: string;
    deleteOrders?: boolean;
  }) {
    const customer = await this.customersRepo.findById(input.customerId);
    if (!customer) throw new NotFoundException('Customer', input.customerId);

    const orders = await this.commerce.listOrders({
      page: 1,
      pageSize: 500,
      customerId: customer.id,
    });

    let cancelled = 0;
    let purgedOrders = 0;

    for (const order of orders.items) {
      if (isCancellable(order.status)) {
        try {
          await this.cancelOrder.execute({
            orderId: order.id,
            actorType: 'ADMIN',
            actorId: input.adminId,
            reason: 'Customer profile purged by admin',
          });
          cancelled += 1;
        } catch {
          // continue purge even if cancel fails (e.g. race)
        }
      }

      if (input.deleteOrders !== false) {
        await this.commerce.purgeOrderCascade(order.id);
        purgedOrders += 1;
      }
    }

    // Active carts for this customer
    const cartRows = await this.db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.customerId, customer.id));

    const warehouse = await this.inventory.getDefaultWarehouse();
    for (const cart of cartRows) {
      const cartId = cart.id;
      const items = await this.cartsRepo.listItems(cartId);
      if (warehouse) {
        for (const item of items) {
          try {
            await this.inventory.release({
              warehouseId: warehouse.id,
              variantId: item.variantId,
              qty: item.quantity,
              referenceType: 'CART',
              referenceId: cartId,
              actorType: 'ADMIN',
              actorId: input.adminId,
              reason: 'Customer purge — release cart hold',
            });
          } catch {
            // Cart may not have held stock
          }
        }
      }
      await this.db.delete(carts).where(eq(carts.id, cartId));
    }

    await this.db
      .delete(customerAddresses)
      .where(eq(customerAddresses.customerId, customer.id));

    try {
      await this.db.delete(customers).where(eq(customers.id, customer.id));
    } catch (err) {
      throw new ValidationException(
        `Could not delete customer row: ${err instanceof Error ? err.message : String(err)}`,
        'CUSTOMER_DELETE_FAILED',
      );
    }

    const { error: authErr } = await this.supabase.auth.admin.deleteUser(
      customer.id,
    );
    if (authErr) {
      // Customer row gone; auth may already be missing
    }

    await this.commerce.writeAudit({
      actorType: 'ADMIN',
      actorId: input.adminId,
      action: 'CUSTOMER_PURGED',
      entityType: 'customer',
      entityId: customer.id,
      before: { email: customer.email, fullName: customer.fullName },
      after: {
        cancelledOrders: cancelled,
        purgedOrders,
        deleteOrders: input.deleteOrders !== false,
      },
    });

    return {
      id: customer.id,
      email: customer.email,
      cancelledOrders: cancelled,
      purgedOrders,
      deleted: true,
    };
  }
}
