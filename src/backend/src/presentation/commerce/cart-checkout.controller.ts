import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  MAX_CART_LINE_QUANTITY,
  assertCartAccess,
  cartTokenSecret,
  hashGuestToken,
} from '../../application/use-cases/carts/cart-access.js';
import { CheckoutUseCase } from '../../application/use-cases/checkout/checkout.use-case.js';
import { GetCurrentUserUseCase } from '../../application/use-cases/auth/get-current-user.use-case.js';
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from '../../domain/repositories/catalog.repository.js';
import {
  CART_REPOSITORY,
  type CartRepository,
} from '../../domain/repositories/cart.repository.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
} from '../../domain/repositories/commerce.repository.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../../domain/repositories/customer.repository.js';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../domain/repositories/inventory.repository.js';
import {
  PLATFORM_SETTINGS_REPOSITORY,
  type PlatformSettingsRepository,
} from '../../domain/repositories/platform-settings.repository.js';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../domain/repositories/unit-of-work.js';
import { effectiveUnitGrossPence } from '../../domain/shared/vat.js';
import {
  ConflictException,
  DomainException,
  NotFoundException,
  ValidationException,
} from '../../domain/exceptions/domain.exception.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { User } from '../../domain/entities/user.entity.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import {
  createOrderViewToken,
  getOrderViewSecret,
} from './order-access.js';
import {
  AddCartItemDto,
  CheckoutDto,
  MergeCartDto,
  UpdateCartItemDto,
} from './commerce.dto.js';

@Controller()
export class CartCheckoutController {
  constructor(
    private readonly checkout: CheckoutUseCase,
    private readonly getCurrentUser: GetCurrentUserUseCase,
    private readonly config: ConfigService,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(CART_REPOSITORY) private readonly carts: CartRepository,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(PLATFORM_SETTINGS_REPOSITORY)
    private readonly settings: PlatformSettingsRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  @Get('checkout/bank-details')
  @RateLimit({ name: 'bank-details', max: 60, windowSeconds: 300 })
  async checkoutBankDetails(
    @Headers('x-guest-token') guestToken?: string,
    @Query('cartId') cartId?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    // Always require an accessible cart — a bare Bearer session is not enough.
    if (!cartId) {
      throw new ValidationException(
        'Start checkout with a cart to view bank details',
        'BANK_DETAILS_UNAUTHORIZED',
      );
    }
    const cart = await this.carts.findById(cartId);
    if (!cart) {
      throw new NotFoundException('Cart', cartId);
    }

    let customerId: string | null = null;
    const header = req?.headers?.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const user = await this.getCurrentUser.execute(header.slice(7).trim());
        customerId = user.id;
      } catch {
        customerId = null;
      }
    }

    assertCartAccess(
      cart,
      { customerId, guestToken },
      cartTokenSecret(this.config),
    );

    const bank = await this.commerce.getActiveBankAccount();
    if (!bank) {
      throw new ValidationException(
        'Bank account is not configured',
        'BANK_NOT_CONFIGURED',
      );
    }
    return {
      bankName: bank.bankName,
      accountName: bank.accountName,
      sortCode: bank.sortCode,
      accountNumber: bank.accountNumber,
      iban: bank.iban,
      referenceInstructions: bank.referenceInstructions,
    };
  }

  @Post('carts')
  @RateLimit({ name: 'cart-create', max: 60, windowSeconds: 3600 })
  async createGuestCart() {
    const token = randomUUID();
    const cart = await this.carts.createGuestCart(
      hashGuestToken(token, cartTokenSecret(this.config)),
    );
    return { cartId: cart.id, guestToken: token };
  }

  /** Loads a cart the caller may use, or throws NOT_FOUND / auth errors. */
  private async findAccessibleCart(cartId: string, guestToken?: string) {
    const cart = await this.carts.findById(cartId);
    if (!cart) throw new NotFoundException('Cart', cartId);
    assertCartAccess(cart, { guestToken }, cartTokenSecret(this.config));
    return cart;
  }

  /** Locks an accessible, ACTIVE cart for the current transaction. */
  private async lockAccessibleCart(cartId: string, guestToken?: string) {
    await this.findAccessibleCart(cartId, guestToken);
    const cart = await this.carts.lockActive(cartId);
    if (!cart) {
      throw new ConflictException(
        'This cart has already been checked out.',
        'CART_NOT_ACTIVE',
      );
    }
    return cart;
  }

  @Get('carts/:cartId')
  async getCart(
    @Param('cartId', new ParseUUIDPipe()) cartId: string,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    const cart = await this.findAccessibleCart(cartId, guestToken);
    if (cart.status !== 'ACTIVE') {
      // Converted/abandoned carts are finished; the client should start a new one.
      throw new NotFoundException('Cart', cartId);
    }
    const items = await this.carts.listItems(cartId);
    const warehouse = await this.inventory.getDefaultWarehouse();
    const enriched = await Promise.all(
      items.map(async (item) => {
        const variant = await this.catalog.getVariantById(item.variantId);
        const product = variant
          ? await this.catalog.getProductById(variant.productId)
          : null;
        const price = variant
          ? await this.catalog.getPriceForVariant(variant.id)
          : null;
        const unit = price
          ? effectiveUnitGrossPence(price.basePricePence, price.salePricePence)
          : 0;
        const purchasable = Boolean(
          variant?.status === 'ACTIVE' && product?.status === 'ACTIVE' && price,
        );
        let availableQuantity = 0;
        if (purchasable && warehouse) {
          const [stock, held] = await Promise.all([
            this.inventory.getItem(warehouse.id, item.variantId),
            this.inventory.getHold({
              warehouseId: warehouse.id,
              variantId: item.variantId,
              referenceType: 'CART',
              referenceId: cartId,
            }),
          ]);
          availableQuantity = Math.max(0, (stock?.available ?? 0) + held);
        }
        return {
          id: item.id,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPricePence: unit,
          lineTotalPence: unit * item.quantity,
          sku: variant?.sku ?? null,
          productName: product?.name ?? null,
          productSlug: product?.slug ?? null,
          purchasable,
          availableQuantity,
          inStock: purchasable && availableQuantity >= item.quantity,
        };
      }),
    );
    const subtotalPence = enriched.reduce(
      (sum, row) => sum + (row.purchasable ? row.lineTotalPence : 0),
      0,
    );
    return {
      id: cart.id,
      status: cart.status,
      currency: cart.currency,
      items: enriched,
      subtotalPence,
      hasUnavailableItems: enriched.some((row) => !row.inStock),
    };
  }

  @Post('carts/:cartId/items')
  @RateLimit({ name: 'cart-write', max: 120, windowSeconds: 60 })
  async addCartItem(
    @Param('cartId', new ParseUUIDPipe()) cartId: string,
    @Body() dto: AddCartItemDto,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    const variant = await this.catalog.getVariantById(dto.variantId);
    const product = variant
      ? await this.catalog.getProductById(variant.productId)
      : null;
    if (
      !variant ||
      variant.status !== 'ACTIVE' ||
      product?.status !== 'ACTIVE'
    ) {
      throw new ValidationException(
        'This item is no longer available',
        'VARIANT_UNAVAILABLE',
      );
    }
    if (!(await this.catalog.getPriceForVariant(variant.id))) {
      throw new ValidationException(
        'This item cannot be purchased right now',
        'VARIANT_UNAVAILABLE',
      );
    }

    return this.uow.run(async () => {
      await this.lockAccessibleCart(cartId, guestToken);
      const existing = (await this.carts.listItems(cartId)).find(
        (i) => i.variantId === dto.variantId,
      );
      const nextQty = (existing?.quantity ?? 0) + dto.quantity;
      if (nextQty > MAX_CART_LINE_QUANTITY) {
        throw new ValidationException(
          `You can buy at most ${MAX_CART_LINE_QUANTITY} of one item per order.`,
          'QUANTITY_LIMIT',
          { max: MAX_CART_LINE_QUANTITY, requested: nextQty },
        );
      }
      await this.applyCartStock(cartId, dto.variantId, nextQty);
      const item = await this.carts.upsertItem(
        cartId,
        dto.variantId,
        dto.quantity,
      );
      await this.carts.touch(cartId);
      return item;
    });
  }

  @Patch('carts/:cartId/items/:itemId')
  @RateLimit({ name: 'cart-write', max: 120, windowSeconds: 60 })
  async updateCartItem(
    @Param('cartId', new ParseUUIDPipe()) cartId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateCartItemDto,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.uow.run(async () => {
      await this.lockAccessibleCart(cartId, guestToken);
      const existing = (await this.carts.listItems(cartId)).find(
        (i) => i.id === itemId,
      );
      if (!existing) throw new NotFoundException('Cart item', itemId);
      await this.applyCartStock(cartId, existing.variantId, dto.quantity);
      const item = await this.carts.updateItemQuantity(itemId, dto.quantity);
      await this.carts.touch(cartId);
      return item;
    });
  }

  @Delete('carts/:cartId/items/:itemId')
  @RateLimit({ name: 'cart-write', max: 120, windowSeconds: 60 })
  async removeCartItem(
    @Param('cartId', new ParseUUIDPipe()) cartId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    return this.uow.run(async () => {
      await this.lockAccessibleCart(cartId, guestToken);
      const existing = (await this.carts.listItems(cartId)).find(
        (i) => i.id === itemId,
      );
      if (!existing) throw new NotFoundException('Cart item', itemId);
      await this.applyCartStock(cartId, existing.variantId, 0);
      await this.carts.removeItem(itemId);
      await this.carts.touch(cartId);
      return { deleted: true };
    });
  }

  /**
   * Validates and (when reserve-on-cart is on) holds stock so this cart has
   * exactly `quantity` units of the variant. Runs inside the cart's lock.
   */
  private async applyCartStock(
    cartId: string,
    variantId: string,
    quantity: number,
  ) {
    const policy = await this.settings.getInventoryPolicy();
    const warehouse = await this.inventory.getDefaultWarehouse();
    if (!warehouse) {
      throw new ConflictException(
        'The shop cannot take orders right now. Please try again later.',
        'WAREHOUSE_NOT_CONFIGURED',
      );
    }

    if (policy.reserveOnCart) {
      let target = quantity;
      if (policy.allowOversell && quantity > 0) {
        // Hold what is free; the rest is accepted as oversold demand.
        const [stock, held] = await Promise.all([
          this.inventory.getItem(warehouse.id, variantId),
          this.inventory.getHold({
            warehouseId: warehouse.id,
            variantId,
            referenceType: 'CART',
            referenceId: cartId,
          }),
        ]);
        target = Math.min(
          quantity,
          Math.max(0, (stock?.available ?? 0) + held),
        );
      }
      try {
        await this.inventory.setHold({
          warehouseId: warehouse.id,
          variantId,
          quantity: target,
          referenceType: 'CART',
          referenceId: cartId,
          actorType: 'SYSTEM',
          reason: 'Cart quantity changed',
        });
      } catch (error) {
        if (
          error instanceof DomainException &&
          error.code === 'INSUFFICIENT_STOCK'
        ) {
          throw this.cartStockError(
            variantId,
            Number(error.details.available ?? 0),
            quantity,
          );
        }
        throw error;
      }
      return;
    }

    if (policy.allowOversell || quantity === 0) return;
    const stock = await this.inventory.getItem(warehouse.id, variantId);
    const available = stock?.available ?? 0;
    if (quantity > available) {
      throw this.cartStockError(variantId, available, quantity);
    }
  }

  private cartStockError(
    variantId: string,
    available: number,
    requested: number,
  ) {
    return new ConflictException(
      available > 0
        ? `Only ${available} available for this item.`
        : 'This item is out of stock.',
      'INSUFFICIENT_STOCK',
      { variantId, available, requested },
    );
  }

  @Post('carts/merge')
  @RateLimit({ name: 'cart-write', max: 120, windowSeconds: 60 })
  @UseGuards(SupabaseAuthGuard)
  async mergeCart(@CurrentUser() user: User, @Body() body: MergeCartDto) {
    await this.customers.ensureFromAuth({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
    return this.uow.run(async () => {
      let customerCart = await this.carts.findActiveByCustomer(user.id);
      if (!customerCart) {
        customerCart = await this.carts.createCustomerCart(user.id);
      }
      await this.carts.lockActive(customerCart.id);
      const guestCart = await this.carts.findByGuestTokenHash(
        hashGuestToken(body.guestToken, cartTokenSecret(this.config)),
      );
      if (guestCart && (await this.carts.lockActive(guestCart.id))) {
        const existing = await this.carts.listItems(customerCart.id);
        for (const item of await this.carts.listItems(guestCart.id)) {
          const current =
            existing.find((e) => e.variantId === item.variantId)?.quantity ?? 0;
          const target = Math.min(
            current + item.quantity,
            MAX_CART_LINE_QUANTITY,
          );
          // Move the stock hold with the line: release guest, hold for customer.
          await this.applyCartStock(guestCart.id, item.variantId, 0);
          await this.applyCartStock(customerCart.id, item.variantId, target);
          await this.carts.upsertItem(
            customerCart.id,
            item.variantId,
            target - current,
          );
        }
        await this.carts.markAbandoned(guestCart.id);
        await this.carts.touch(customerCart.id);
      }
      const items = await this.carts.listItems(customerCart.id);
      return { ...customerCart, items };
    });
  }

  @Post('checkout')
  @RateLimit({ name: 'checkout', max: 20, windowSeconds: 600 })
  async placeOrder(
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    const result = await this.checkout.execute({
      ...dto,
      customerId: null,
      guestToken: guestToken ?? null,
      idempotencyKey: idempotencyKey ?? null,
    });
    const viewToken = createOrderViewToken(
      result.orderNumber,
      dto.email,
      getOrderViewSecret(this.config),
    );
    return { ...result, viewToken };
  }

  @Post('checkout/authenticated')
  @RateLimit({ name: 'checkout', max: 20, windowSeconds: 600 })
  @UseGuards(SupabaseAuthGuard)
  async placeOrderAuthenticated(
    @CurrentUser() user: User,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-guest-token') guestToken?: string,
  ) {
    await this.customers.ensureFromAuth({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
    const email = (dto.email || user.email).toLowerCase();
    const result = await this.checkout.execute({
      ...dto,
      email,
      customerId: user.id,
      guestToken: guestToken ?? null,
      idempotencyKey: idempotencyKey ?? null,
    });
    const viewToken = createOrderViewToken(
      result.orderNumber,
      email,
      getOrderViewSecret(this.config),
    );
    return { ...result, viewToken };
  }
}
