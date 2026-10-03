import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  MAX_CART_LINE_QUANTITY,
  assertCartAccess,
  cartTokenSecret,
  hashGuestToken,
} from '../../application/use-cases/carts/cart-access.js';
import { CheckoutUseCase } from '../../application/use-cases/checkout/checkout.use-case.js';
import { ReleaseExpiredHoldsUseCase } from '../../application/use-cases/inventory/release-expired-holds.use-case.js';
import { CustomerNotifier } from '../../application/use-cases/notifications/customer-notifier.js';
import {
  CreateRefundUseCase,
  CreateShipmentUseCase,
} from '../../application/use-cases/orders/fulfilment.use-cases.js';
import { PurgeCustomerUseCase } from '../../application/use-cases/customers/purge-customer.use-case.js';
import {
  ApprovePaymentUseCase,
  CancelOrderUseCase,
  RejectPaymentUseCase,
  TransitionOrderStatusUseCase,
} from '../../application/use-cases/orders/order-lifecycle.use-cases.js';
import { SubmitPaymentProofUseCase } from '../../application/use-cases/payments/submit-payment-proof.use-case.js';
import { GetFileUrlUseCase } from '../../application/use-cases/storage/get-file-url.use-case.js';
import { Permission } from '../../domain/auth/permissions.js';
import {
  OrderStatus,
  isCancellable,
} from '../../domain/orders/order-status.js';
import { Inject } from '@nestjs/common';
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
  RATE_LIMITER,
  type RateLimiter,
} from '../../domain/repositories/rate-limiter.js';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../domain/repositories/unit-of-work.js';
import {
  normalizePagination,
  paginated,
} from '../../domain/shared/pagination.js';
import { effectiveUnitGrossPence } from '../../domain/shared/vat.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { User } from '../../domain/entities/user.entity.js';
import type { AdminAuthenticatedRequest } from '../common/guards/admin-auth.guard.js';
import { Req } from '@nestjs/common';
import {
  ConflictException,
  DomainException,
  NotFoundException,
  ValidationException,
} from '../../domain/exceptions/domain.exception.js';
import {
  assertSafeStoragePath,
  createOrderViewToken,
  getOrderViewSecret,
} from './order-access.js';
import { GetCurrentUserUseCase } from '../../application/use-cases/auth/get-current-user.use-case.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';

class UkAddressDto {
  @IsString() @MaxLength(120) fullName!: string;
  @IsString() @MaxLength(200) line1!: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsString() @MaxLength(100) city!: string;
  @IsOptional() @IsString() @MaxLength(100) county?: string;
  @IsString() @MaxLength(10) postcode!: string;
  @IsOptional() @IsString() @MaxLength(40) country?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

class CheckoutDto {
  @IsUUID() cartId!: string;
  @IsUUID() shippingMethodId!: string;
  @ValidateNested() @Type(() => UkAddressDto) shippingAddress!: UkAddressDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => UkAddressDto)
  billingAddress?: UkAddressDto;
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) customerNote?: string;
  /** Grand total shown to the shopper; mismatch → 409 PRICE_CHANGED. */
  @IsOptional() @IsInt() @Min(0) expectedTotalPence?: number;
}

class AddCartItemDto {
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) @Max(MAX_CART_LINE_QUANTITY) quantity!: number;
}

class FulfilmentLineDto {
  @IsUUID() orderItemId!: string;
  @IsInt() @Min(1) @Max(10_000) quantity!: number;
}

class CreateShipmentDto {
  /** Omit to ship everything still outstanding. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FulfilmentLineDto)
  items?: FulfilmentLineDto[];
  @IsOptional() @IsString() @MaxLength(100) carrier?: string;
  @IsOptional() @IsString() @MaxLength(100) trackingNumber?: string;
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(500)
  trackingUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

class RefundLineDto extends FulfilmentLineDto {
  /** Shipped units only: false for damaged goods (default true). */
  @IsOptional() @IsBoolean() restock?: boolean;
}

class CreateRefundDto {
  /** Omit to refund everything not yet refunded. */
  @IsOptional() @IsInt() @Min(1) amountPence?: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RefundLineDto)
  items?: RefundLineDto[];
}

class MergeCartDto {
  @IsString() @IsNotEmpty() @MaxLength(100) guestToken!: string;
}

class CancelOrderDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

class CustomerStatusDto {
  @IsIn(['ACTIVE', 'BLOCKED']) status!: 'ACTIVE' | 'BLOCKED';
}

class ReturnItemDto {
  @IsUUID() orderItemId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class ReturnRequestDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(1000) customerNote?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
}

class ProductListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() collectionId?: string;
  @IsOptional() @IsUUID() attributeOptionId?: string;
  @IsOptional() @IsUUID() sizeValueId?: string;
  @IsOptional() @IsUUID() colorId?: string;
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  inStock?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPricePence?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPricePence?: number;
}

class CreateProductDto {
  @IsString() name!: string;
  @IsString() slug!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() productType!: 'SIMPLE' | 'VARIABLE';
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsInt() @Min(0) basePricePence?: number;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) sizeValueIds?: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) colorIds?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) initialStock?: number;
}

class CreateVariantDto {
  @IsString() sku!: string;
  @IsOptional() @IsString() optionFingerprint?: string;
  @IsOptional() @IsUUID() sizeValueId?: string;
  @IsOptional() @IsUUID() colorId?: string;
  @IsOptional() @IsInt() @Min(0) basePricePence?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) initialStock?: number;
}

class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional()
  @IsString()
  status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsUUID() departmentId?: string | null;
}

class UpdateVariantDto {
  @IsOptional() @IsString() sku?: string;
  @IsOptional()
  @IsString()
  status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) basePricePence?: number;
}

const MANUAL_MOVEMENT_TYPES = [
  'MANUAL_ADJUSTMENT',
  'INITIAL_STOCK',
  'PURCHASE',
  'RETURN',
  'DAMAGE',
  'LOSS',
] as const;

class AdjustInventoryDto {
  @IsUUID() warehouseId!: string;
  @IsUUID() variantId!: string;
  @IsInt() @Min(-1_000_000) @Max(1_000_000) onHandDelta!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsIn(MANUAL_MOVEMENT_TYPES) movementType?: string;
}

class TransitionOrderDto {
  @IsIn(Object.values(OrderStatus)) status!: OrderStatus;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsString() @MaxLength(100) carrier?: string;
  @IsOptional() @IsString() @MaxLength(100) trackingNumber?: string;
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(500)
  trackingUrl?: string;
  /** RETURNED only — put returned units back into stock (default true). */
  @IsOptional() @IsBoolean() restock?: boolean;
}

class OrderLookupDto {
  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @IsEmail()
  email!: string;
}

class RejectPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason!: string;
}

class PaymentProofMetaDto {
  @IsString() @MaxLength(500) storagePath!: string;
  @IsString() @MaxLength(100) mime!: string;
  @IsInt() @Min(1) sizeBytes!: number;
  @IsOptional() @IsInt() @Min(0) amountClaimedPence?: number;
  @IsOptional() @IsString() @MaxLength(100) customerReference?: string;
  @IsOptional() @IsString() @MaxLength(1000) customerNote?: string;
}

class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CART_LINE_QUANTITY)
  quantity!: number;
}

class UpsertBankAccountDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) bankName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) accountName!: string;
  @Matches(/^\d{2}-?\d{2}-?\d{2}$/, {
    message: 'sortCode must be 6 digits, e.g. 12-34-56',
  })
  sortCode!: string;
  @Matches(/^\d{8}$/, { message: 'accountNumber must be 8 digits' })
  accountNumber!: string;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(/\s+/g, '').toUpperCase() || undefined
      : value,
  )
  @Matches(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, { message: 'iban is not valid' })
  iban?: string | null;
  @IsOptional() @IsString() @MaxLength(500) referenceInstructions?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpsertSettingDto {
  @IsOptional() value?: Record<string, unknown>;
  @IsOptional() @IsString() description?: string;
}

@Controller()
export class CommerceController {
  constructor(
    private readonly checkout: CheckoutUseCase,
    private readonly submitProof: SubmitPaymentProofUseCase,
    private readonly approvePayment: ApprovePaymentUseCase,
    private readonly rejectPayment: RejectPaymentUseCase,
    private readonly cancelOrder: CancelOrderUseCase,
    private readonly transitionOrder: TransitionOrderStatusUseCase,
    private readonly purgeCustomer: PurgeCustomerUseCase,
    private readonly getFileUrl: GetFileUrlUseCase,
    private readonly getCurrentUser: GetCurrentUserUseCase,
    private readonly releaseExpiredHolds: ReleaseExpiredHoldsUseCase,
    private readonly createShipment: CreateShipmentUseCase,
    private readonly createRefund: CreateRefundUseCase,
    private readonly notifier: CustomerNotifier,
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
    @Inject(RATE_LIMITER) private readonly rateLimiter: RateLimiter,
  ) {}

  private proofBucket() {
    return (
      this.config.get<string>('supabase.paymentProofsBucket') ??
      'payment-proofs'
    );
  }

  private async withProofUrls<T extends { storagePath: string; mime: string }>(
    proofs: T[],
  ) {
    return Promise.all(
      proofs.map(async (proof) => {
        try {
          const url = await this.getFileUrl.execute(
            this.proofBucket(),
            proof.storagePath,
            true,
            60 * 60,
          );
          return { ...proof, url, isImage: proof.mime.startsWith('image/') };
        } catch {
          return {
            ...proof,
            url: null,
            isImage: proof.mime.startsWith('image/'),
          };
        }
      }),
    );
  }

  // —— Public catalog ——
  @Get('departments')
  listDepartments() {
    return this.catalog.listDepartments();
  }

  @Get('categories')
  listCategories(@Query('departmentId') departmentId?: string) {
    return this.catalog.listCategories(departmentId);
  }

  @Get('brands')
  listBrands() {
    return this.catalog.listBrands();
  }

  @Get('collections')
  listCollections() {
    return this.catalog.listCollections();
  }

  @Get('catalog/filters')
  getStorefrontFilters() {
    return this.catalog.getStorefrontFilters();
  }

  @Get('products')
  async listProducts(@Query() query: ProductListQueryDto) {
    const page = normalizePagination(query.page, query.pageSize);
    const result = await this.catalog.listProducts({
      ...page,
      q: query.q,
      categoryId: query.categoryId,
      brandId: query.brandId,
      departmentId: query.departmentId,
      collectionId: query.collectionId,
      attributeOptionId: query.attributeOptionId,
      sizeValueId: query.sizeValueId,
      colorId: query.colorId,
      inStock: query.inStock,
      minPricePence: query.minPricePence,
      maxPricePence: query.maxPricePence,
      publicOnly: true,
    });
    const items = await this.catalog.enrichProductSummaries(result.items);
    return paginated(items, result.total, page);
  }

  @Get('products/:slug')
  async getProduct(@Param('slug') slug: string) {
    const product = await this.catalog.getProductBySlug(slug);
    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException('Product');
    }
    const variants = await this.catalog.listVariants(product.id);
    let price = await this.catalog.getPriceForProduct(product.id);
    if (!price) {
      const defaultVariant =
        variants.find((v) => v.isDefault && v.status === 'ACTIVE') ??
        variants.find((v) => v.status === 'ACTIVE');
      if (defaultVariant) {
        price = await this.catalog.getPriceForVariant(defaultVariant.id);
      }
    }
    return {
      ...product,
      basePricePence: price?.basePricePence ?? null,
      price: price
        ? {
            basePence: price.basePricePence,
            salePence: price.salePricePence,
            compareAtPence: price.compareAtPence,
            currency: price.currency,
            vatInclusive: price.vatInclusive,
          }
        : null,
      variants: await Promise.all(
        variants
          .filter((v) => v.status === 'ACTIVE')
          .map(async (v) => {
            const warehouse = await this.inventory.getDefaultWarehouse();
            const stock = warehouse
              ? await this.inventory.getItem(warehouse.id, v.id)
              : null;
            const variantPrice = await this.catalog.getPriceForVariant(v.id);
            return {
              id: v.id,
              sku: v.sku,
              available: stock?.available ?? 0,
              basePricePence: variantPrice?.basePricePence ?? null,
              salePricePence: variantPrice?.salePricePence ?? null,
            };
          }),
      ),
    };
  }

  @Get('shipping/methods')
  listShipping() {
    return this.commerce.listShippingMethods(true);
  }

  @Get('checkout/bank-details')
  @RateLimit({ name: 'bank-details', max: 60, windowSeconds: 300 })
  async checkoutBankDetails(
    @Headers('x-guest-token') guestToken?: string,
    @Query('cartId') cartId?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    let authorized = false;

    const header = req?.headers?.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        await this.getCurrentUser.execute(header.slice(7).trim());
        authorized = true;
      } catch {
        authorized = false;
      }
    }

    if (!authorized) {
      if (!cartId || !guestToken) {
        throw new ValidationException(
          'Start checkout with a cart to view bank details',
          'BANK_DETAILS_UNAUTHORIZED',
        );
      }
      const cart = await this.carts.findById(cartId);
      if (!cart) {
        throw new NotFoundException('Cart', cartId);
      }
      assertCartAccess(cart, { guestToken }, cartTokenSecret(this.config));
      authorized = true;
    }

    if (!authorized) {
      throw new ValidationException(
        'Start checkout with a cart to view bank details',
        'BANK_DETAILS_UNAUTHORIZED',
      );
    }

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

  // —— Carts ——
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

  // —— Checkout ——
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

  // —— Customer orders ——
  @Get('orders')
  @UseGuards(SupabaseAuthGuard)
  async myOrders(
    @CurrentUser() user: User,
    @Query() query: PaginationQueryDto,
  ) {
    const page = normalizePagination(query.page, query.pageSize);
    const result = await this.commerce.listOrders({
      ...page,
      customerId: user.id,
      email: user.email,
    });
    return paginated(result.items, result.total, page);
  }

  @Post('orders/lookup')
  @RateLimit(
    { name: 'order-lookup', max: 10, windowSeconds: 600 },
    {
      name: 'order-lookup-number',
      max: 5,
      windowSeconds: 600,
      by: 'body:orderNumber',
    },
  )
  async lookupOrder(@Body() dto: OrderLookupDto) {
    const order = await this.commerce.getOrderByNumber(dto.orderNumber.trim());
    if (!order) {
      throw new ValidationException('Order not found', 'NOT_FOUND');
    }
    if (order.email.toLowerCase() !== dto.email.trim().toLowerCase()) {
      // Same message to avoid email enumeration against order numbers
      throw new ValidationException('Order not found', 'NOT_FOUND');
    }
    const viewToken = createOrderViewToken(
      order.orderNumber,
      order.email,
      getOrderViewSecret(this.config),
    );
    return {
      orderNumber: order.orderNumber,
      email: order.email,
      viewToken,
      status: order.status,
      paymentStatus: order.paymentStatus,
    };
  }

  @Get('orders/:orderNumber')
  @RateLimit({ name: 'order-view', max: 120, windowSeconds: 300 })
  async getOrder(
    @Param('orderNumber') orderNumber: string,
    @Query('email') email: string | undefined,
    @Query('viewToken') viewToken: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const order = await this.commerce.getOrderByNumber(orderNumber);
    if (!order) throw new ValidationException('Order not found', 'NOT_FOUND');

    let user: User | null = null;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        user = await this.getCurrentUser.execute(header.slice(7).trim());
      } catch {
        user = null;
      }
    }

    const isOwner = Boolean(user && order.customerId === user.id);
    const signedInEmailMatch = Boolean(
      user && user.email.trim().toLowerCase() === order.email.toLowerCase(),
    );
    const emailMatch =
      Boolean(email) &&
      email!.trim().toLowerCase() === order.email.toLowerCase();
    const tokenOk =
      Boolean(viewToken) &&
      viewToken ===
        createOrderViewToken(
          order.orderNumber,
          order.email,
          getOrderViewSecret(this.config),
        );
    const canViewFull =
      isOwner || signedInEmailMatch || (emailMatch && tokenOk);

    if (!canViewFull) {
      // Anti-enumeration: only confirm existence with matching credentials
      throw new ValidationException('Order not found', 'NOT_FOUND');
    }

    // Attach guest order to the signed-in customer when emails match
    if (user && !order.customerId && signedInEmailMatch) {
      await this.commerce.claimGuestOrder(order.id, user.id);
    }

    const items = await this.commerce.listOrderItems(order.id);
    const payment = await this.commerce.getPaymentByOrderId(order.id);
    const proofs = payment
      ? await this.withProofUrls(
          await this.commerce.listPaymentProofs(payment.id),
        )
      : [];
    const [shipments, refunds, timeline, addresses] = await Promise.all([
      this.commerce.listShipments(order.id),
      this.commerce.listRefunds(order.id),
      this.commerce.listOrderTimeline(order.id, { customerOnly: true }),
      this.commerce.listOrderAddresses(order.id),
    ]);
    return {
      ...order,
      items,
      shipments,
      refunds,
      timeline,
      shippingAddress: addresses.find((a) => a.type === 'SHIPPING') ?? null,
      billingAddress: addresses.find((a) => a.type === 'BILLING') ?? null,
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            amountDuePence: payment.amountDuePence,
            amountClaimedPence: payment.amountClaimedPence,
            bankAccount: payment.bankAccountSnapshot,
            proofs,
          }
        : null,
    };
  }

  @Post('orders/:orderNumber/payment-proofs')
  @RateLimit({ name: 'proof-submit', max: 20, windowSeconds: 600 })
  @UseGuards(SupabaseAuthGuard)
  async uploadProof(
    @Param('orderNumber') orderNumber: string,
    @Body() dto: PaymentProofMetaDto,
    @CurrentUser() user: User,
  ) {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];
    if (!allowed.includes(dto.mime)) {
      throw new ValidationException(
        'Unsupported media type',
        'UNSUPPORTED_MEDIA_TYPE',
      );
    }
    const max = this.config.get<number>('maxUploadBytes') ?? 10_485_760;
    if (dto.sizeBytes > max) {
      throw new ValidationException('File too large', 'PAYLOAD_TOO_LARGE');
    }
    const storagePath = assertSafeStoragePath(
      dto.storagePath,
      `orders/${orderNumber}/`,
    );
    return this.submitProof.execute({
      bucket: this.proofBucket(),
      orderNumber,
      customerId: user.id,
      customerEmail: user.email,
      storagePath,
      mime: dto.mime,
      sizeBytes: dto.sizeBytes,
      amountClaimedPence: dto.amountClaimedPence,
      customerReference: dto.customerReference,
      customerNote: dto.customerNote,
    });
  }

  // —— Admin catalog ——
  @Post('admin/products')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminCreateProduct(@Body() dto: CreateProductDto) {
    const sizeIds = dto.sizeValueIds ?? [];
    const colorIds = dto.colorIds ?? [];
    const hasOptions = sizeIds.length > 0 || colorIds.length > 0;
    const productType = hasOptions ? 'VARIABLE' : dto.productType;

    let departmentId = dto.departmentId ?? null;
    if (dto.categoryId) {
      const categories = await this.catalog.listCategories();
      const category = categories.find((c) => c.id === dto.categoryId);
      if (!category) {
        throw new NotFoundException('Category');
      }
      if (!category.isActive) {
        throw new ValidationException('Category is inactive');
      }
      departmentId = departmentId ?? category.departmentId;
    }

    return this.uow.run(async () => {
      const product = await this.catalog.createProduct({
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        productType,
        departmentId,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        status: 'DRAFT',
      });

      const vat = await this.catalog.getDefaultVatRate();
      if (!vat) throw new ValidationException('Default VAT rate missing');

      const warehouse = await this.inventory.getDefaultWarehouse();
      const initialStock = dto.initialStock ?? 0;
      const slugPart = dto.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-');

      const sizes =
        sizeIds.length > 0
          ? (await this.catalog.listAllSizeValues()).filter((s) =>
              sizeIds.includes(s.id),
            )
          : [];
      const colors =
        colorIds.length > 0
          ? (await this.catalog.listColors()).filter((c) =>
              colorIds.includes(c.id),
            )
          : [];

      type Combo = {
        size?: { id: string; code: string };
        color?: { id: string; name: string };
      };
      const combos: Combo[] = [];
      if (hasOptions) {
        const sizeList = sizes.length > 0 ? sizes : [undefined];
        const colorList = colors.length > 0 ? colors : [undefined];
        for (const size of sizeList) {
          for (const color of colorList) {
            combos.push({
              size: size ? { id: size.id, code: size.code } : undefined,
              color: color ? { id: color.id, name: color.name } : undefined,
            });
          }
        }
      } else {
        combos.push({});
      }

      let isFirst = true;
      for (const combo of combos) {
        const skuParts = [slugPart];
        if (combo.size) skuParts.push(combo.size.code.toUpperCase());
        if (combo.color) {
          skuParts.push(
            combo.color.name
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, '')
              .slice(0, 12),
          );
        }
        if (!combo.size && !combo.color) {
          skuParts.push(dto.sku?.trim().toUpperCase() || 'DEFAULT');
        }
        const sku = skuParts.join('-');
        const fingerprint = [
          combo.size?.id ?? 'nosize',
          combo.color?.id ?? 'nocolor',
        ].join(':');

        const variant = await this.catalog.createVariant({
          productId: product.id,
          sku,
          optionFingerprint: hasOptions ? fingerprint : 'default',
          isDefault: isFirst,
        });
        isFirst = false;

        if (combo.size || combo.color) {
          await this.catalog.attachVariantOptions({
            variantId: variant.id,
            sizeValueId: combo.size?.id ?? null,
            colorId: combo.color?.id ?? null,
          });
        }

        if (dto.basePricePence != null) {
          await this.catalog.upsertPrice({
            productId: product.id,
            variantId: variant.id,
            basePricePence: dto.basePricePence,
            vatRateId: vat.id,
          });
        }

        if (warehouse && initialStock > 0) {
          await this.inventory.adjust({
            warehouseId: warehouse.id,
            variantId: variant.id,
            onHandDelta: initialStock,
            movementType: 'MANUAL_ADJUSTMENT',
            actorType: 'ADMIN',
            reason: 'Initial stock on product create',
          });
        }
      }

      return this.catalog.updateProduct(product.id, { status: 'ACTIVE' });
    });
  }

  @Post('admin/products/:productId/variants')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminCreateVariant(
    @Param('productId') productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    const product = await this.catalog.getProductById(productId);
    if (!product || product.status === 'ARCHIVED') {
      throw new NotFoundException('Product');
    }

    const sku = dto.sku.trim().toUpperCase();
    if (!sku) {
      throw new ValidationException('SKU is required');
    }

    return this.uow.run(async () => {
      const existingSku = await this.catalog.getVariantBySku(sku);
      if (existingSku) {
        throw new ValidationException(
          `SKU "${sku}" already exists`,
          'DUPLICATE_SKU',
        );
      }

      const hasOptions = Boolean(dto.sizeValueId || dto.colorId);
      const fingerprint =
        dto.optionFingerprint?.trim() ||
        (hasOptions
          ? `${dto.sizeValueId ?? 'nosize'}:${dto.colorId ?? 'nocolor'}`
          : `sku:${sku}`);

      const existingVariants = await this.catalog.listVariants(productId);
      const duplicateOption = existingVariants.find(
        (v) => v.status !== 'ARCHIVED' && v.optionFingerprint === fingerprint,
      );
      if (duplicateOption) {
        throw new ValidationException(
          `A variant with this size/color already exists (${duplicateOption.sku})`,
          'DUPLICATE_OPTION',
        );
      }

      if (hasOptions && product.productType !== 'VARIABLE') {
        await this.catalog.updateProduct(productId, {
          productType: 'VARIABLE',
        });
      }

      // Unique violations (concurrent create) surface as 409 DUPLICATE.
      const variant = await this.catalog.createVariant({
        productId,
        sku,
        optionFingerprint: fingerprint,
        isDefault:
          existingVariants.filter((v) => v.status !== 'ARCHIVED').length === 0,
      });

      if (hasOptions) {
        await this.catalog.attachVariantOptions({
          variantId: variant.id,
          sizeValueId: dto.sizeValueId ?? null,
          colorId: dto.colorId ?? null,
        });
      }

      if (dto.basePricePence != null) {
        const vat = await this.catalog.getDefaultVatRate();
        if (!vat) throw new ValidationException('Default VAT rate missing');
        await this.catalog.upsertPrice({
          productId,
          variantId: variant.id,
          basePricePence: dto.basePricePence,
          vatRateId: vat.id,
        });
      }

      const warehouse = await this.inventory.getDefaultWarehouse();
      const initialStock = dto.initialStock ?? 0;
      if (warehouse && initialStock > 0) {
        await this.inventory.adjust({
          warehouseId: warehouse.id,
          variantId: variant.id,
          onHandDelta: initialStock,
          movementType: 'MANUAL_ADJUSTMENT',
          actorType: 'ADMIN',
          reason: 'Initial stock on variant create',
        });
      }

      return {
        ...variant,
        onHand: initialStock,
        available: initialStock,
        reserved: 0,
      };
    });
  }

  @Get('admin/products/:productId/variants')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_READ)
  async adminListVariants(@Param('productId') productId: string) {
    const product = await this.catalog.getProductById(productId);
    if (!product)
      throw new NotFoundException('Product');
    const variants = await this.catalog.listVariants(productId);
    const warehouse = await this.inventory.getDefaultWarehouse();
    return Promise.all(
      variants.map(async (v) => {
        const stock = warehouse
          ? await this.inventory.getItem(warehouse.id, v.id)
          : null;
        return {
          id: v.id,
          sku: v.sku,
          status: v.status,
          isDefault: v.isDefault,
          productId: v.productId,
          onHand: stock?.onHand ?? 0,
          reserved: stock?.reserved ?? 0,
          available: stock?.available ?? 0,
        };
      }),
    );
  }

  @Get('admin/products')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_READ)
  async adminListProducts(
    @Query() query: PaginationQueryDto & { q?: string; status?: string },
  ) {
    const page = normalizePagination(query.page, query.pageSize);
    const result = await this.catalog.listProducts({
      ...page,
      q: query.q,
      status: query.status,
    });
    const items = await this.catalog.enrichProductSummaries(result.items);
    return paginated(items, result.total, page);
  }

  @Get('admin/products/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_READ)
  async adminGetProduct(@Param('id') id: string) {
    const product = await this.catalog.getProductById(id);
    if (!product)
      throw new NotFoundException('Product');
    const variants = await this.catalog.listVariants(id);
    const warehouse = await this.inventory.getDefaultWarehouse();
    const productPrice = await this.catalog.getPriceForProduct(id);
    const enrichedVariants = await Promise.all(
      variants.map(async (v) => {
        const stock = warehouse
          ? await this.inventory.getItem(warehouse.id, v.id)
          : null;
        const variantPrice = await this.catalog.getPriceForVariant(v.id);
        return {
          id: v.id,
          sku: v.sku,
          status: v.status,
          isDefault: v.isDefault,
          productId: v.productId,
          onHand: stock?.onHand ?? 0,
          reserved: stock?.reserved ?? 0,
          available: stock?.available ?? 0,
          basePricePence:
            variantPrice?.basePricePence ??
            productPrice?.basePricePence ??
            null,
        };
      }),
    );
    return {
      ...product,
      basePricePence: productPrice?.basePricePence ?? null,
      warehouseId: warehouse?.id ?? null,
      variants: enrichedVariants,
      totalOnHand: enrichedVariants.reduce((sum, v) => sum + v.onHand, 0),
      totalAvailable: enrichedVariants.reduce((sum, v) => sum + v.available, 0),
    };
  }

  @Patch('admin/products/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminUpdateProduct(
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    const before = await this.catalog.getProductById(id);
    if (!before)
      throw new NotFoundException('Product');

    let departmentId = body.departmentId;
    if (body.categoryId) {
      const categories = await this.catalog.listCategories();
      const category = categories.find((c) => c.id === body.categoryId);
      if (!category) {
        throw new NotFoundException('Category');
      }
      if (departmentId === undefined) {
        departmentId = category.departmentId;
      }
    } else if (body.categoryId === null) {
      departmentId = body.departmentId === undefined ? null : body.departmentId;
    }

    const updated = await this.catalog.updateProduct(id, {
      name: body.name,
      slug: body.slug,
      description: body.description,
      shortDescription: body.shortDescription,
      status: body.status,
      categoryId: body.categoryId,
      departmentId,
    });
    await this.commerce.writeAudit({
      actorType: 'ADMIN',
      actorId: req.adminUser?.id,
      action: 'PRODUCT_UPDATED',
      entityType: 'product',
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  }

  @Delete('admin/products/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminDeleteProduct(
    @Param('id') id: string,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    const before = await this.catalog.getProductById(id);
    if (!before)
      throw new NotFoundException('Product');
    const variants = await this.catalog.listVariants(id);
    await this.assertNoReservedStock(variants.map((v) => v.id));
    return this.uow.run(async () => {
      let stockRowsRemoved = 0;
      for (const variant of variants) {
        const purged = await this.inventory.purgeVariantStock({
          variantId: variant.id,
          actorType: 'ADMIN',
          actorId: req.adminUser?.id,
          reason: `Product deleted (${before.name}) — clear linked stock`,
        });
        stockRowsRemoved += purged.removed;
        if (variant.status !== 'ARCHIVED') {
          await this.catalog.updateVariant(variant.id, { status: 'ARCHIVED' });
        }
      }
      const updated = await this.catalog.updateProduct(id, {
        status: 'ARCHIVED',
      });
      await this.commerce.writeAudit({
        actorType: 'ADMIN',
        actorId: req.adminUser?.id,
        action: 'PRODUCT_DELETED',
        entityType: 'product',
        entityId: id,
        before,
        after: { ...updated, stockRowsRemoved },
      });
      return { id, status: 'ARCHIVED', stockRowsRemoved };
    });
  }

  /**
   * Archiving drops stock rows; refuse while carts/orders hold units, or the
   * open orders could never be shipped.
   */
  private async assertNoReservedStock(variantIds: string[]) {
    const warehouse = await this.inventory.getDefaultWarehouse();
    if (!warehouse) return;
    for (const variantId of variantIds) {
      const stock = await this.inventory.getItem(warehouse.id, variantId);
      if (stock && stock.reserved > 0) {
        throw new ConflictException(
          `${stock.reserved} unit(s) are reserved by open carts or orders. Fulfil or cancel those orders first, or set the product to INACTIVE to stop new sales.`,
          'STOCK_RESERVED',
          { variantId, reserved: stock.reserved },
        );
      }
    }
  }

  @Patch('admin/products/:productId/variants/:variantId')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminUpdateVariant(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    const variant = await this.catalog.getVariantById(variantId);
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('Variant');
    }
    const sku = dto.sku === undefined ? undefined : dto.sku.trim().toUpperCase();
    if (sku === '') throw new ValidationException('SKU is required');
    if (sku && sku !== variant.sku) {
      const clash = await this.catalog.getVariantBySku(sku);
      if (clash) {
        throw new ValidationException(
          `SKU "${sku}" already exists`,
          'DUPLICATE_SKU',
        );
      }
    }
    const updated = await this.catalog.updateVariant(variantId, {
      sku,
      status: dto.status,
      isDefault: dto.isDefault,
    });
    if (dto.basePricePence != null) {
      const vat = await this.catalog.getDefaultVatRate();
      if (!vat) throw new ValidationException('Default VAT rate missing');
      await this.catalog.upsertPrice({
        productId,
        variantId,
        basePricePence: dto.basePricePence,
        vatRateId: vat.id,
      });
    }
    return updated;
  }

  @Delete('admin/products/:productId/variants/:variantId')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminDeleteVariant(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    const variant = await this.catalog.getVariantById(variantId);
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('Variant');
    }
    await this.assertNoReservedStock([variantId]);
    return this.uow.run(async () => {
      await this.inventory.purgeVariantStock({
        variantId,
        actorType: 'ADMIN',
        actorId: req.adminUser?.id,
        reason: `Variant deleted (${variant.sku}) — clear linked stock`,
      });
      return this.catalog.updateVariant(variantId, { status: 'ARCHIVED' });
    });
  }

  // —— Admin inventory ——
  @Get('admin/warehouses')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  listWarehouses() {
    return this.inventory.listWarehouses();
  }

  @Get('admin/inventory')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  async listInventory(
    @Query()
    query: PaginationQueryDto & { warehouseId?: string },
    @Query('productId', new ParseUUIDPipe({ optional: true }))
    productId?: string,
  ) {
    const page = normalizePagination(query.page, query.pageSize);
    const result = await this.inventory.listItems({
      ...page,
      warehouseId: query.warehouseId,
      productId,
    });
    return paginated(result.items, result.total, page);
  }

  @Post('admin/inventory/adjust')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  async adjustInventory(
    @Body() dto: AdjustInventoryDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    const variant = await this.catalog.getVariantById(dto.variantId);
    if (!variant || variant.status === 'ARCHIVED') {
      throw new NotFoundException('Variant');
    }
    const product = await this.catalog.getProductById(variant.productId);
    if (!product || product.status === 'ARCHIVED') {
      throw new ValidationException(
        'Inventory can only be adjusted for active products',
        'PRODUCT_ARCHIVED',
      );
    }

    const item = await this.inventory.adjust({
      warehouseId: dto.warehouseId,
      variantId: dto.variantId,
      onHandDelta: dto.onHandDelta,
      movementType: dto.movementType ?? 'MANUAL_ADJUSTMENT',
      actorType: 'ADMIN',
      actorId: req.adminUser?.id,
      reason: dto.reason,
    });
    await this.commerce.writeAudit({
      actorType: 'ADMIN',
      actorId: req.adminUser?.id,
      action: 'STOCK_ADJUSTED',
      entityType: 'inventory_item',
      entityId: item.id,
      after: { ...item, productId: product.id, sku: variant.sku },
    });
    return item;
  }

  @Get('admin/inventory/movements')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.INVENTORY_ADJUST)
  async listMovements(
    @Query() query: PaginationQueryDto & { variantId?: string },
  ) {
    const page = normalizePagination(query.page, query.pageSize);
    const result = await this.inventory.listMovements({
      ...page,
      variantId: query.variantId,
    });
    return paginated(result.items, result.total, page);
  }

  // —— Admin orders / payments ——
  @Get('admin/orders')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORDERS_READ)
  async adminOrders(
    @Query()
    query: PaginationQueryDto & {
      status?: string;
      paymentStatus?: string;
      q?: string;
    },
  ) {
    const page = normalizePagination(query.page, query.pageSize);
    const result = await this.commerce.listOrders({
      ...page,
      status: query.status,
      paymentStatus: query.paymentStatus,
      q: query.q,
    });
    return paginated(result.items, result.total, page);
  }

  @Get('admin/orders/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORDERS_READ)
  async adminGetOrder(@Param('id') id: string) {
    const order = await this.commerce.getOrderById(id);
    if (!order) throw new ValidationException('Order not found', 'NOT_FOUND');
    const items = await this.commerce.listOrderItems(order.id);
    const payment = await this.commerce.getPaymentByOrderId(order.id);
    const proofs = payment
      ? await this.withProofUrls(
          await this.commerce.listPaymentProofs(payment.id),
        )
      : [];
    const [shipments, refunds, timeline, addresses] = await Promise.all([
      this.commerce.listShipments(order.id),
      this.commerce.listRefunds(order.id),
      this.commerce.listOrderTimeline(order.id),
      this.commerce.listOrderAddresses(order.id),
    ]);
    return {
      ...order,
      items,
      shipments,
      refunds,
      timeline,
      shippingAddress: addresses.find((a) => a.type === 'SHIPPING') ?? null,
      billingAddress: addresses.find((a) => a.type === 'BILLING') ?? null,
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            amountDuePence: payment.amountDuePence,
            amountClaimedPence: payment.amountClaimedPence,
            bankAccountSnapshot: payment.bankAccountSnapshot,
            proofs,
          }
        : null,
    };
  }

  @Patch('admin/orders/:id/status')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORDERS_STATUS)
  async adminTransition(
    @Param('id') id: string,
    @Body() dto: TransitionOrderDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    return this.transitionOrder.execute({
      orderId: id,
      toStatus: dto.status,
      adminId: req.adminUser!.id,
      note: dto.note,
      restock: dto.restock,
      tracking: {
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber,
        trackingUrl: dto.trackingUrl,
      },
    });
  }

  @Post('admin/orders/:id/cancel')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORDER_CANCEL)
  async adminCancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CancelOrderDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    return this.cancelOrder.execute({
      orderId: id,
      actorType: 'ADMIN',
      actorId: req.adminUser!.id,
      reason: body.reason,
    });
  }

  @Post('admin/orders/:id/shipments')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORDERS_STATUS)
  async adminCreateShipment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateShipmentDto,
    @Req() req: AdminAuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.createShipment.execute({
      orderId: id,
      adminId: req.adminUser!.id,
      items: dto.items,
      carrier: dto.carrier,
      trackingNumber: dto.trackingNumber,
      trackingUrl: dto.trackingUrl,
      note: dto.note,
      idempotencyKey,
    });
  }

  @Post('admin/orders/:id/refunds')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.PAYMENT_VERIFY)
  async adminCreateRefund(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateRefundDto,
    @Req() req: AdminAuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.createRefund.execute({
      orderId: id,
      adminId: req.adminUser!.id,
      amountPence: dto.amountPence,
      reason: dto.reason,
      reference: dto.reference,
      items: dto.items,
      idempotencyKey,
    });
  }

  @Get('admin/payments/queue')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.PAYMENT_VERIFY)
  async paymentQueue(
    @Query()
    query: PaginationQueryDto & {
      status?: string;
      q?: string;
      hasProof?: string;
    },
  ) {
    const page = normalizePagination(query.page, query.pageSize);
    const hasProof =
      query.hasProof === 'true'
        ? true
        : query.hasProof === 'false'
          ? false
          : undefined;
    const result = await this.commerce.listPaymentQueue({
      ...page,
      status: query.status,
      q: query.q,
      hasProof,
    });
    const items = await Promise.all(
      result.items.map(async (item) => {
        const proofs = await this.withProofUrls(item.proofs);
        const latest = proofs[0];
        return {
          id: item.id,
          orderId: item.orderId,
          orderNumber: item.orderNumber,
          email: item.email,
          status: item.status,
          amountDuePence: item.amountDuePence,
          amountClaimedPence: item.amountClaimedPence,
          customerReference: latest?.customerReference ?? null,
          bankAccountSnapshot: item.bankAccountSnapshot,
          proofCount: item.proofCount,
          proofs,
        };
      }),
    );
    return paginated(items, result.total, page);
  }

  @Get('admin/bank-accounts')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_BANK_CONFIG)
  listBankAccounts() {
    return this.commerce.listBankAccounts();
  }

  @Post('admin/bank-accounts')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_BANK_CONFIG)
  upsertBankAccount(
    @Body() dto: UpsertBankAccountDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    return this.uow.run(async () => {
      const account = await this.commerce.upsertBankAccount({
        ...dto,
        sortCode: dto.sortCode.replace(
          /^(\d{2})-?(\d{2})-?(\d{2})$/,
          '$1-$2-$3',
        ),
        iban: dto.iban ?? null,
      });
      await this.commerce.writeAudit({
        actorType: 'ADMIN',
        actorId: req.adminUser?.id,
        action: dto.id ? 'BANK_ACCOUNT_UPDATED' : 'BANK_ACCOUNT_CREATED',
        entityType: 'payment_bank_account',
        entityId: account.id,
        after: {
          bankName: account.bankName,
          sortCode: account.sortCode,
          accountNumberLast4: account.accountNumber.slice(-4),
          isActive: account.isActive,
        },
      });
      return account;
    });
  }

  @Patch('admin/bank-accounts/:id/activate')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_BANK_CONFIG)
  activateBankAccount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    return this.uow.run(async () => {
      const account = await this.commerce.setBankAccountActive(id, true);
      await this.commerce.writeAudit({
        actorType: 'ADMIN',
        actorId: req.adminUser?.id,
        action: 'BANK_ACCOUNT_ACTIVATED',
        entityType: 'payment_bank_account',
        entityId: account.id,
      });
      return account;
    });
  }

  @Post('admin/payments/:id/approve')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.PAYMENT_VERIFY)
  async approve(
    @Param('id') id: string,
    @Req() req: AdminAuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Body() body?: { note?: string },
  ) {
    return this.approvePayment.execute({
      paymentId: id,
      adminId: req.adminUser!.id,
      idempotencyKey,
      note: body?.note,
    });
  }

  @Post('admin/payments/:id/reject')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.PAYMENT_VERIFY)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectPaymentDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    return this.rejectPayment.execute({
      paymentId: id,
      adminId: req.adminUser!.id,
      reason: dto.reason,
    });
  }

  @Get('admin/dashboard')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.REPORTING_READ)
  async dashboard() {
    const policy = await this.settings.getInventoryPolicy();
    return this.commerce.getDashboardStats({
      lowStockThreshold: policy.lowStockThreshold,
    });
  }

  @Post('admin/maintenance/release-expired-holds')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORDER_CANCEL)
  releaseExpired(@Req() req: AdminAuthenticatedRequest) {
    return this.releaseExpiredHolds.execute({
      actorType: 'ADMIN',
      actorId: req.adminUser!.id,
    });
  }

  /** Vercel Cron entry point; authorised by the CRON_SECRET bearer token. */
  @Get('cron/release-expired-holds')
  async cronReleaseExpired(@Headers('authorization') authorization?: string) {
    const secret = this.config.get<string>('cronSecret');
    if (
      !secret ||
      !constantTimeEquals(authorization ?? '', `Bearer ${secret}`)
    ) {
      throw new NotFoundException('Route');
    }
    const result = await this.releaseExpiredHolds.execute({
      actorType: 'SYSTEM',
    });
    const rateLimitBucketsPurged = await this.rateLimiter.purgeOlderThan(24);
    const emails = await this.notifier.dispatchDue();
    return { ...result, rateLimitBucketsPurged, emails };
  }

  @Get('admin/customers')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORDERS_READ)
  async adminCustomers(@Query() query: PaginationQueryDto & { q?: string }) {
    const page = normalizePagination(query.page, query.pageSize);
    const result = await this.customers.list({ ...page, q: query.q });
    return paginated(result.items, result.total, page);
  }

  @Get('admin/customers/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORDERS_READ)
  async adminGetCustomer(@Param('id') id: string) {
    const customer = await this.customers.findById(id);
    if (!customer)
      throw new ValidationException('Customer not found', 'NOT_FOUND');
    const orders = await this.commerce.listOrders({
      page: 1,
      pageSize: 50,
      customerId: id,
    });
    return {
      ...customer,
      orders: orders.items,
      orderCount: orders.total,
    };
  }

  @Patch('admin/customers/:id/status')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CUSTOMERS_BLOCK)
  async adminSetCustomerStatus(
    @Param('id') id: string,
    @Body() body: CustomerStatusDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    const existing = await this.customers.findById(id);
    if (!existing) throw new NotFoundException('Customer', id);
    const updated = await this.customers.setStatus(id, body.status);
    await this.commerce.writeAudit({
      actorType: 'ADMIN',
      actorId: req.adminUser?.id,
      action: 'CUSTOMER_STATUS_CHANGED',
      entityType: 'customer',
      entityId: id,
      after: { status: body.status },
    });
    return updated;
  }

  @Delete('admin/customers/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CUSTOMERS_BLOCK)
  async adminDeleteCustomer(
    @Param('id') id: string,
    @Query('deleteOrders') deleteOrders: string | undefined,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    return this.purgeCustomer.execute({
      customerId: id,
      adminId: req.adminUser!.id,
      deleteOrders: deleteOrders !== 'false',
    });
  }

  @Delete('admin/orders/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORDER_CANCEL)
  async adminDeleteOrder(
    @Param('id') id: string,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    const order = await this.commerce.getOrderById(id);
    if (!order) throw new NotFoundException('Order', id);
    await this.uow.run(async () => {
      if (isCancellable(order.status)) {
        // Releases its stock reservation before the rows disappear.
        await this.cancelOrder.execute({
          orderId: id,
          actorType: 'ADMIN',
          actorId: req.adminUser!.id,
          reason: 'Order deleted by admin',
        });
      }
      await this.commerce.purgeOrderCascade(id);
      await this.commerce.writeAudit({
        actorType: 'ADMIN',
        actorId: req.adminUser?.id,
        action: 'ORDER_PURGED',
        entityType: 'order',
        entityId: id,
        before: {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          grandTotalPence: order.grandTotalPence,
        },
      });
    });
    return { deleted: true, id };
  }

  @Get('admin/settings')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_SETTINGS)
  listSettings() {
    return this.settings.list();
  }

  @Get('admin/settings/:key')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_SETTINGS)
  async getSetting(@Param('key') key: string) {
    const row = await this.settings.get(key);
    if (!row) throw new ValidationException('Setting not found', 'NOT_FOUND');
    return row;
  }

  @Put('admin/settings/:key')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_SETTINGS)
  async upsertSetting(
    @Param('key') key: string,
    @Body() body: UpsertSettingDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    if (
      !body.value ||
      typeof body.value !== 'object' ||
      Array.isArray(body.value)
    ) {
      throw new ValidationException('value object is required');
    }
    const defaults = this.settings.getDefaults(key);
    if (!defaults) {
      throw new NotFoundException('Setting', key);
    }
    this.assertSettingTypes(key, defaults, body.value);
    const existing = await this.settings.get(key);
    const merged = { ...(existing?.value ?? {}), ...body.value };
    const updated = await this.settings.upsert(
      key,
      merged,
      req.adminUser?.id,
      body.description ?? existing?.description ?? null,
    );
    await this.commerce.writeAudit({
      actorType: 'ADMIN',
      actorId: req.adminUser?.id,
      action: 'PLATFORM_SETTING_UPDATED',
      entityType: 'platform_settings',
      entityId: key,
      before: existing?.value ?? null,
      after: updated.value,
    });
    return updated;
  }

  /** Known fields must keep their type; counts and money must be whole and >= 0. */
  private assertSettingTypes(
    key: string,
    defaults: Record<string, unknown>,
    value: Record<string, unknown>,
  ) {
    for (const [field, next] of Object.entries(value)) {
      if (!(field in defaults)) continue;
      const expected = typeof defaults[field];
      const ok =
        expected === 'number'
          ? typeof next === 'number' && Number.isInteger(next) && next >= 0
          : typeof next === expected;
      if (!ok) {
        throw new ValidationException(
          `${key}.${field} must be ${
            expected === 'number'
              ? 'a whole number of 0 or more'
              : `a ${expected}`
          }`,
          'INVALID_SETTING',
          { key, field },
        );
      }
    }
  }

  @Post('admin/departments')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createDepartment(
    @Body()
    body: {
      name: string;
      slug: string;
      sortOrder?: number;
      imageUrl?: string | null;
    },
  ) {
    return this.catalog.createDepartment(body);
  }

  @Patch('admin/departments/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateDepartment(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      slug: string;
      sortOrder: number;
      imageUrl: string | null;
      isActive: boolean;
    }>,
  ) {
    return this.catalog.updateDepartment(id, body);
  }

  @Post('admin/categories')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createCategory(
    @Body()
    body: {
      departmentId: string;
      parentId?: string;
      name: string;
      slug: string;
      sortOrder?: number;
      imageUrl?: string | null;
    },
  ) {
    return this.catalog.createCategory(body);
  }

  @Patch('admin/categories/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateCategory(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      slug: string;
      departmentId: string;
      sortOrder: number;
      imageUrl: string | null;
    }>,
  ) {
    return this.catalog.updateCategory(id, body);
  }

  @Delete('admin/categories/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async deleteCategory(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.uow.run(() => this.catalog.deleteCategory(id));
    return { deleted: true };
  }

  @Get('colors')
  listColors() {
    return this.catalog.listColors();
  }

  @Post('admin/colors')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createColor(@Body() body: { name: string; hex?: string }) {
    return this.catalog.createColor(body);
  }

  @Patch('admin/colors/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateColor(
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; hex: string | null }>,
  ) {
    return this.catalog.updateColor(id, body);
  }

  @Delete('admin/colors/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async deleteColor(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.uow.run(() => this.catalog.deleteColor(id));
    return { deleted: true };
  }

  @Get('sizes')
  listSizes() {
    return this.catalog.listAllSizeValues();
  }

  @Post('admin/sizes')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async createSize(
    @Body() body: { code: string; label: string; sizeSystemId?: string },
  ) {
    let systemId = body.sizeSystemId;
    if (!systemId) {
      const systems = await this.catalog.listSizeSystems();
      const clothing =
        systems.find((s) => s.code === 'CLOTHING_ALPHA') ?? systems[0];
      if (!clothing) {
        throw new ValidationException('No size system configured');
      }
      systemId = clothing.id;
    }
    return this.catalog.createSizeSystemValue({
      sizeSystemId: systemId,
      code: body.code,
      label: body.label,
    });
  }

  @Patch('admin/sizes/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateSize(
    @Param('id') id: string,
    @Body() body: Partial<{ code: string; label: string; sortOrder: number }>,
  ) {
    return this.catalog.updateSizeSystemValue(id, body);
  }

  @Delete('admin/sizes/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async deleteSize(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.uow.run(() => this.catalog.deleteSizeSystemValue(id));
    return { deleted: true };
  }

  @Post('admin/brands')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createBrand(
    @Body() body: { name: string; slug: string; description?: string },
  ) {
    return this.catalog.createBrand(body);
  }

  @Post('admin/collections')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createCollection(
    @Body() body: { name: string; slug: string; description?: string },
  ) {
    return this.catalog.createCollection(body);
  }

  @Post('orders/:orderNumber/returns')
  @RateLimit({ name: 'returns', max: 10, windowSeconds: 3600 })
  @UseGuards(SupabaseAuthGuard)
  async requestReturn(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() user: User,
    @Body() body: ReturnRequestDto,
  ) {
    return this.uow.run(async () => {
      const order = await this.commerce.getOrderByNumber(orderNumber);
      if (!order) throw new NotFoundException('Order', orderNumber);
      const ownsOrder = order.customerId
        ? order.customerId === user.id
        : order.email === user.email.trim().toLowerCase();
      if (!ownsOrder) throw new NotFoundException('Order', orderNumber);

      if (
        order.status !== OrderStatus.SHIPPED &&
        order.status !== OrderStatus.DELIVERED
      ) {
        throw new ValidationException(
          'Returns can only be requested once an order has shipped',
          'RETURN_NOT_ALLOWED',
          { status: order.status },
        );
      }

      const orderItems = await this.commerce.listOrderItems(order.id);
      const requested = new Map<string, number>();
      for (const line of body.items) {
        requested.set(
          line.orderItemId,
          (requested.get(line.orderItemId) ?? 0) + line.quantity,
        );
      }
      for (const [orderItemId, quantity] of requested) {
        const item = orderItems.find((i) => i.id === orderItemId);
        if (!item) {
          throw new ValidationException(
            'A returned item is not part of this order',
            'RETURN_ITEM_INVALID',
            { orderItemId },
          );
        }
        if (quantity > item.quantity) {
          throw new ValidationException(
            `You can return at most ${item.quantity} of ${item.productName}`,
            'RETURN_QUANTITY_INVALID',
            { orderItemId, ordered: item.quantity, requested: quantity },
          );
        }
      }

      if (!order.customerId) {
        await this.commerce.claimGuestOrder(order.id, user.id);
      }
      // Status first: a duplicate request conflicts and rolls back.
      await this.commerce.updateOrderStatus({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: OrderStatus.RETURN_REQUESTED,
        actorType: 'CUSTOMER',
        actorId: user.id,
        note: body.reason ?? 'Return requested',
      });
      return this.commerce.createReturnRequest({
        orderId: order.id,
        reason: body.reason,
        customerNote: body.customerNote,
        items: body.items,
      });
    });
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
