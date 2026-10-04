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
import { MAX_CART_LINE_QUANTITY } from '../../application/use-cases/carts/cart-access.js';
import { OrderStatus } from '../../domain/orders/order-status.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';

export class UkAddressDto {
  @IsString() @MaxLength(120) fullName!: string;
  @IsString() @MaxLength(200) line1!: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsString() @MaxLength(100) city!: string;
  @IsOptional() @IsString() @MaxLength(100) county?: string;
  @IsString() @MaxLength(10) postcode!: string;
  @IsOptional() @IsString() @MaxLength(40) country?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class CheckoutDto {
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

export class AddCartItemDto {
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) @Max(MAX_CART_LINE_QUANTITY) quantity!: number;
}

export class FulfilmentLineDto {
  @IsUUID() orderItemId!: string;
  @IsInt() @Min(1) @Max(10_000) quantity!: number;
}

export class CreateShipmentDto {
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

export class RefundLineDto extends FulfilmentLineDto {
  /** Shipped units only: false for damaged goods (default true). */
  @IsOptional() @IsBoolean() restock?: boolean;
}

export class CreateRefundDto {
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

export class MergeCartDto {
  @IsString() @IsNotEmpty() @MaxLength(100) guestToken!: string;
}

export class CancelOrderDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class CustomerStatusDto {
  @IsIn(['ACTIVE', 'BLOCKED']) status!: 'ACTIVE' | 'BLOCKED';
}

/** Query for /admin/customers/diary — must whitelist every param (forbidNonWhitelisted). */
export class CustomerDiaryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(['spend', 'orders', 'recent'])
  sort?: 'spend' | 'orders' | 'recent';
}

/** Shared search on /admin/customers list. */
export class CustomerListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class ReturnItemDto {
  @IsUUID() orderItemId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ReturnRequestDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(1000) customerNote?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
}

export class ProductListQueryDto extends PaginationQueryDto {
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

export class CreateProductDto {
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

export class CreateVariantDto {
  @IsString() sku!: string;
  @IsOptional() @IsString() optionFingerprint?: string;
  @IsOptional() @IsUUID() sizeValueId?: string;
  @IsOptional() @IsUUID() colorId?: string;
  @IsOptional() @IsInt() @Min(0) basePricePence?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) initialStock?: number;
}

export class UpdateProductDto {
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

export class UpdateVariantDto {
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

export class AdjustInventoryDto {
  @IsUUID() warehouseId!: string;
  @IsUUID() variantId!: string;
  @IsInt() @Min(-1_000_000) @Max(1_000_000) onHandDelta!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsIn(MANUAL_MOVEMENT_TYPES) movementType?: string;
}

export class TransitionOrderDto {
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

export class OrderLookupDto {
  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @IsEmail()
  email!: string;
}

export class RejectPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason!: string;
}

export class PaymentProofMetaDto {
  @IsString() @MaxLength(500) storagePath!: string;
  @IsString() @MaxLength(100) mime!: string;
  @IsInt() @Min(1) sizeBytes!: number;
  @IsOptional() @IsInt() @Min(0) amountClaimedPence?: number;
  @IsOptional() @IsString() @MaxLength(100) customerReference?: string;
  @IsOptional() @IsString() @MaxLength(1000) customerNote?: string;
}

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CART_LINE_QUANTITY)
  quantity!: number;
}

export class UpsertBankAccountDto {
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

export class UpsertSettingDto {
  @IsOptional() value?: Record<string, unknown>;
  @IsOptional() @IsString() description?: string;
}
