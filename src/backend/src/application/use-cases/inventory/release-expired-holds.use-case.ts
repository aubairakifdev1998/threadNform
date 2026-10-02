import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CART_REPOSITORY,
  type CartRepository,
} from '../../../domain/repositories/cart.repository.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
} from '../../../domain/repositories/commerce.repository.js';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../../domain/repositories/inventory.repository.js';
import {
  PLATFORM_SETTINGS_REPOSITORY,
  type PlatformSettingsRepository,
} from '../../../domain/repositories/platform-settings.repository.js';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../domain/repositories/unit-of-work.js';
import { CancelOrderUseCase } from '../orders/order-lifecycle.use-cases.js';

const BATCH_SIZE = 200;

export type ReleaseExpiredHoldsResult = {
  cartsReleased: number;
  ordersCancelled: number;
  failures: number;
};

/**
 * Housekeeping for stock holds, run by cron or an admin:
 * - idle carts keep their lines but give their stock back (checkout
 *   re-reserves, so the shopper only notices if the item sold out);
 * - unpaid orders with no proof uploaded are cancelled after the configured
 *   window, releasing their reservation.
 */
@Injectable()
export class ReleaseExpiredHoldsUseCase {
  private readonly logger = new Logger(ReleaseExpiredHoldsUseCase.name);

  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: CartRepository,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(PLATFORM_SETTINGS_REPOSITORY)
    private readonly settings: PlatformSettingsRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly cancelOrder: CancelOrderUseCase,
  ) {}

  async execute(input: {
    actorType: 'ADMIN' | 'SYSTEM';
    actorId?: string | null;
    now?: Date;
  }): Promise<ReleaseExpiredHoldsResult> {
    const now = input.now ?? new Date();
    const [inventoryPolicy, commercePolicy, warehouse] = await Promise.all([
      this.settings.getInventoryPolicy(),
      this.settings.getCommercePolicy(),
      this.inventory.getDefaultWarehouse(),
    ]);
    const result: ReleaseExpiredHoldsResult = {
      cartsReleased: 0,
      ordersCancelled: 0,
      failures: 0,
    };

    if (warehouse && inventoryPolicy.cartHoldMinutes > 0) {
      const idleSince = new Date(
        now.getTime() - inventoryPolicy.cartHoldMinutes * 60_000,
      );
      const cartIds = await this.carts.listIdleActiveCartIds(
        idleSince,
        BATCH_SIZE,
      );
      for (const cartId of cartIds) {
        try {
          const released = await this.uow.run(async () => {
            // Re-check under lock: the shopper may have just touched the cart.
            const cart = await this.carts.lockActive(cartId);
            if (!cart) return false;
            const items = await this.carts.listItems(cartId);
            let changed = false;
            for (const item of items) {
              const held = await this.inventory.getHold({
                warehouseId: warehouse.id,
                variantId: item.variantId,
                referenceType: 'CART',
                referenceId: cartId,
              });
              if (held === 0) continue;
              await this.inventory.setHold({
                warehouseId: warehouse.id,
                variantId: item.variantId,
                quantity: 0,
                referenceType: 'CART',
                referenceId: cartId,
                actorType: 'SYSTEM',
                reason: `Cart idle for ${inventoryPolicy.cartHoldMinutes} minutes`,
              });
              changed = true;
            }
            return changed;
          });
          if (released) result.cartsReleased += 1;
        } catch (error) {
          result.failures += 1;
          this.logger.error(
            `Failed to release hold for cart ${cartId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }

    if (commercePolicy.autoExpirePendingHours > 0) {
      const placedBefore = new Date(
        now.getTime() - commercePolicy.autoExpirePendingHours * 3_600_000,
      );
      const orderIds = await this.commerce.listExpiredUnpaidOrderIds(
        placedBefore,
        BATCH_SIZE,
      );
      for (const orderId of orderIds) {
        try {
          await this.cancelOrder.execute({
            orderId,
            actorType: input.actorType,
            actorId: input.actorId ?? null,
            reason: `Payment not received within ${commercePolicy.autoExpirePendingHours} hours`,
          });
          result.ordersCancelled += 1;
        } catch (error) {
          result.failures += 1;
          this.logger.error(
            `Failed to expire unpaid order ${orderId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }

    return result;
  }
}
