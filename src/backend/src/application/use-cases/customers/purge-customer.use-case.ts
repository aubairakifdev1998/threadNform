import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import {
  ConflictException,
  NotFoundException,
} from '../../../domain/exceptions/domain.exception.js';
import {
  CART_REPOSITORY,
  type CartRepository,
} from '../../../domain/repositories/cart.repository.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
  type Order,
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
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../domain/repositories/unit-of-work.js';
import {
  DRIZZLE,
  type DrizzleDB,
} from '../../../infrastructure/drizzle/drizzle.tokens.js';
import {
  carts,
  customerAddresses,
  customers,
} from '../../../infrastructure/drizzle/schema/index.js';
import { SUPABASE_ADMIN_CLIENT } from '../../../infrastructure/supabase/supabase.tokens.js';
import { CancelOrderUseCase } from '../orders/order-lifecycle.use-cases.js';

@Injectable()
export class PurgeCustomerUseCase {
  private readonly logger = new Logger(PurgeCustomerUseCase.name);

  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customersRepo: CustomerRepository,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(CART_REPOSITORY) private readonly cartsRepo: CartRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
    private readonly cancelOrder: CancelOrderUseCase,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(input: {
    customerId: string;
    adminId: string;
    deleteOrders?: boolean;
  }) {
    const customer = await this.customersRepo.findById(input.customerId);
    if (!customer) throw new NotFoundException('Customer', input.customerId);

    // Snapshot every order first; purging while paging would shift pages.
    const allOrders: Order[] = [];
    for (let page = 1; ; page += 1) {
      const batch = await this.commerce.listOrders({
        page,
        pageSize: 100,
        customerId: customer.id,
      });
      allOrders.push(...batch.items);
      if (batch.items.length < 100) break;
    }

    let cancelled = 0;
    let purgedOrders = 0;

    for (const order of allOrders) {
      // Each order is cancelled (stock released) and purged atomically.
      await this.uow.run(async () => {
        if (isCancellable(order.status)) {
          await this.cancelOrder.execute({
            orderId: order.id,
            actorType: 'ADMIN',
            actorId: input.adminId,
            reason: 'Customer profile purged by admin',
          });
          cancelled += 1;
        }
        if (input.deleteOrders !== false) {
          await this.commerce.purgeOrderCascade(order.id);
          purgedOrders += 1;
        }
      });
    }

    const warehouse = await this.inventory.getDefaultWarehouse();
    await this.uow.run(async () => {
      const cartRows = await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.customerId, customer.id));
      for (const cart of cartRows) {
        if (warehouse) {
          for (const item of await this.cartsRepo.listItems(cart.id)) {
            await this.inventory.setHold({
              warehouseId: warehouse.id,
              variantId: item.variantId,
              quantity: 0,
              referenceType: 'CART',
              referenceId: cart.id,
              actorType: 'ADMIN',
              actorId: input.adminId,
              reason: 'Customer purge — release cart hold',
            });
          }
        }
        await this.db.delete(carts).where(eq(carts.id, cart.id));
      }
    });

    await this.db
      .delete(customerAddresses)
      .where(eq(customerAddresses.customerId, customer.id));

    try {
      await this.db.delete(customers).where(eq(customers.id, customer.id));
    } catch (err) {
      this.logger.error(
        `Could not delete customer ${customer.id}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new ConflictException(
        'This customer still has orders on record. Delete their orders too, or block the account instead.',
        'CUSTOMER_DELETE_FAILED',
      );
    }

    const { error: authErr } = await this.supabase.auth.admin.deleteUser(
      customer.id,
    );
    if (authErr && authErr.status !== 404) {
      // Profile data is gone; the login must not survive silently.
      this.logger.error(
        `Customer ${customer.id} purged but auth user deletion failed: ${authErr.message}`,
      );
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
