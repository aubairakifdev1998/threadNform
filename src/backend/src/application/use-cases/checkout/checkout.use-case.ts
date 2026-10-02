import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  ForbiddenException,
  InsufficientStockException,
  NotFoundException,
  ValidationException,
} from '../../../domain/exceptions/domain.exception.js';
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from '../../../domain/repositories/catalog.repository.js';
import {
  CART_REPOSITORY,
  type CartRepository,
} from '../../../domain/repositories/cart.repository.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
  type Order,
  type Payment,
} from '../../../domain/repositories/commerce.repository.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../../../domain/repositories/customer.repository.js';
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
import {
  assertUkShippingAddress,
  isValidUkPhone,
  normalizeUkPhone,
  type UkAddressInput,
} from '../../../domain/shared/uk-address.js';
import {
  effectiveUnitGrossPence,
  extractVatFromInclusiveGross,
} from '../../../domain/shared/vat.js';
import { assertCartAccess, cartTokenSecret } from '../carts/cart-access.js';
import { CustomerNotifier } from '../notifications/customer-notifier.js';

export type CheckoutInput = {
  cartId: string;
  shippingMethodId: string;
  shippingAddress: UkAddressInput;
  billingAddress?: UkAddressInput | null;
  email: string;
  phone?: string | null;
  customerId?: string | null;
  customerNote?: string | null;
  idempotencyKey?: string | null;
  /** Required for guest carts; verified against cart.guestTokenHash */
  guestToken?: string | null;
  /**
   * Grand total the customer saw. When supplied and the server-side total
   * differs (price/shipping change), checkout is refused with PRICE_CHANGED.
   */
  expectedTotalPence?: number | null;
};

export type CheckoutResult = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totals: {
    subtotalPence: number;
    shippingPence: number;
    vatPence: number;
    netPence: number;
    grandTotalPence: number;
    currency: string;
  };
  bankAccount: Record<string, unknown> | null;
  idempotentReplay: boolean;
};

type LineSnapshot = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  unitGrossPence: number;
  quantity: number;
  vatRateBps: number;
  vatPence: number;
  netPence: number;
  lineGrossPence: number;
};

@Injectable()
export class CheckoutUseCase {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: CartRepository,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(PLATFORM_SETTINGS_REPOSITORY)
    private readonly settings: PlatformSettingsRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly notifier: CustomerNotifier,
    private readonly config: ConfigService,
  ) {}

  async execute(input: CheckoutInput): Promise<CheckoutResult> {
    const email = input.email.trim().toLowerCase();
    const idempotencyKey = input.idempotencyKey?.trim() || null;
    if (idempotencyKey && idempotencyKey.length > 200) {
      throw new ValidationException(
        'Idempotency-Key is too long',
        'INVALID_IDEMPOTENCY_KEY',
      );
    }

    if (idempotencyKey) {
      const replay = await this.findReplay(
        idempotencyKey,
        email,
        input.customerId,
      );
      if (replay) return replay;
    }

    const policy = await this.settings.getCommercePolicy();
    if (policy.maintenanceMode) {
      throw new ConflictException(
        'The store is temporarily closed for maintenance. Please try again soon.',
        'STORE_MAINTENANCE',
      );
    }
    if (!policy.manualBankTransferEnabled) {
      throw new ConflictException(
        'Checkout is temporarily unavailable. Please try again later.',
        'PAYMENT_METHOD_UNAVAILABLE',
      );
    }
    if (!input.customerId && !policy.guestCheckoutEnabled) {
      throw new ValidationException(
        'Please sign in to place an order.',
        'GUEST_CHECKOUT_DISABLED',
      );
    }
    if (input.customerId) {
      const customer = await this.customers.findById(input.customerId);
      if (customer?.status === 'BLOCKED') {
        throw new ForbiddenException(
          'This account cannot place orders. Please contact support.',
          'ACCOUNT_BLOCKED',
        );
      }
    }

    const cart = await this.carts.findById(input.cartId);
    if (!cart) throw new NotFoundException('Cart', input.cartId);
    assertCartAccess(
      cart,
      { customerId: input.customerId, guestToken: input.guestToken },
      cartTokenSecret(this.config),
    );
    if (cart.status !== 'ACTIVE') {
      throw new ConflictException(
        'This cart has already been checked out.',
        'CART_ALREADY_CHECKED_OUT',
      );
    }

    const shippingAddress = assertUkShippingAddress(input.shippingAddress);
    const billingAddress = assertUkShippingAddress(
      input.billingAddress ?? input.shippingAddress,
    );
    const phone = this.resolvePhone(input.phone, shippingAddress.phone);
    if (policy.requirePhone && !phone) {
      throw new ValidationException(
        'A contact phone number is required.',
        'PHONE_REQUIRED',
      );
    }
    const customerNote = policy.allowNotes
      ? input.customerNote?.trim() || null
      : null;

    const shipping = await this.commerce.getShippingMethod(
      input.shippingMethodId,
    );
    if (!shipping || !shipping.isActive) {
      throw new ValidationException(
        'The selected delivery method is no longer available.',
        'SHIPPING_METHOD_UNAVAILABLE',
      );
    }
    const shippingVatRate =
      (await this.catalog.getVatRate(shipping.vatRateId)) ??
      (await this.catalog.getDefaultVatRate());
    if (!shippingVatRate) {
      throw new ValidationException('Shipping VAT rate missing');
    }

    const bank = await this.commerce.getActiveBankAccount();
    if (!bank) {
      throw new ConflictException(
        'Checkout is temporarily unavailable. Please try again later.',
        'BANK_NOT_CONFIGURED',
      );
    }

    const warehouse = await this.inventory.getDefaultWarehouse();
    if (!warehouse) {
      throw new ConflictException(
        'Checkout is temporarily unavailable. Please try again later.',
        'WAREHOUSE_NOT_CONFIGURED',
      );
    }

    let placed: { order: Order; payment: Payment; result: CheckoutResult };
    try {
      placed = await this.uow.run(async () => {
        // Claim first: a second concurrent checkout of the same cart blocks
        // here until we commit, then sees CONVERTED and stops.
        if (!(await this.carts.claimForCheckout(cart.id))) {
          throw new ConflictException(
            'This cart has already been checked out.',
            'CART_ALREADY_CHECKED_OUT',
          );
        }

        const items = await this.carts.listItems(cart.id);
        if (!items.length) {
          throw new ValidationException('Your cart is empty.', 'CART_EMPTY');
        }

        // Stable lock order across concurrent checkouts avoids deadlocks.
        items.sort((a, b) => a.variantId.localeCompare(b.variantId));

        const lines: LineSnapshot[] = [];
        const vatLines: unknown[] = [];
        let subtotalPence = 0;
        let itemsNet = 0;
        let itemsVat = 0;

        for (const item of items) {
          const variant = await this.catalog.getVariantById(item.variantId);
          if (!variant || variant.status !== 'ACTIVE') {
            throw new ConflictException(
              'An item in your cart is no longer available. Please review your cart.',
              'VARIANT_UNAVAILABLE',
              { variantId: item.variantId },
            );
          }
          const product = await this.catalog.getProductById(variant.productId);
          if (!product || product.status !== 'ACTIVE') {
            throw new ConflictException(
              'An item in your cart is no longer available. Please review your cart.',
              'PRODUCT_NOT_PURCHASABLE',
              { productId: variant.productId, variantId: variant.id },
            );
          }
          const price = await this.catalog.getPriceForVariant(variant.id);
          if (!price) {
            throw new ConflictException(
              `${product.name} cannot be purchased right now.`,
              'PRICE_MISSING',
              { sku: variant.sku },
            );
          }
          const vatRate = await this.catalog.getVatRate(price.vatRateId);
          if (!vatRate) {
            throw new ValidationException('VAT rate missing');
          }

          const unitGross = effectiveUnitGrossPence(
            price.basePricePence,
            price.salePricePence,
          );
          const lineGross = unitGross * item.quantity;
          const breakdown = extractVatFromInclusiveGross(
            lineGross,
            vatRate.rateBps,
          );

          subtotalPence += lineGross;
          itemsNet += breakdown.netPence;
          itemsVat += breakdown.vatPence;
          vatLines.push({ sku: variant.sku, ...breakdown });
          lines.push({
            variantId: variant.id,
            productId: product.id,
            productName: product.name,
            sku: variant.sku,
            unitGrossPence: unitGross,
            quantity: item.quantity,
            vatRateBps: vatRate.rateBps,
            vatPence: breakdown.vatPence,
            netPence: breakdown.netPence,
            lineGrossPence: lineGross,
          });
        }

        if (subtotalPence < policy.minOrderPence) {
          throw new ValidationException(
            `The minimum order value is £${(policy.minOrderPence / 100).toFixed(2)}.`,
            'MIN_ORDER_NOT_MET',
            { minOrderPence: policy.minOrderPence, subtotalPence },
          );
        }

        const shippingBreakdown = extractVatFromInclusiveGross(
          shipping.pricePence,
          shippingVatRate.rateBps,
        );
        const netPence = itemsNet + shippingBreakdown.netPence;
        const vatPence = itemsVat + shippingBreakdown.vatPence;
        const grandTotalPence = subtotalPence + shipping.pricePence;

        if (
          input.expectedTotalPence != null &&
          input.expectedTotalPence !== grandTotalPence
        ) {
          throw new ConflictException(
            'Prices in your cart have changed. Please review the new total before placing your order.',
            'PRICE_CHANGED',
            { expectedTotalPence: input.expectedTotalPence, grandTotalPence },
          );
        }

        const orderNumber = await this.commerce.allocateOrderNumber(
          ukYear(new Date()),
        );
        const { order, payment } = await this.commerce.createOrder({
          orderNumber,
          customerId: input.customerId ?? cart.customerId,
          email,
          phone,
          idempotencyKey,
          customerNote,
          totals: {
            subtotalPence,
            discountPence: 0,
            netPence,
            vatPence,
            shippingPence: shipping.pricePence,
            grandTotalPence,
          },
          shippingMethodSnapshot: {
            id: shipping.id,
            code: shipping.code,
            name: shipping.name,
            pricePence: shipping.pricePence,
            etaMinDays: shipping.etaMinDays,
            etaMaxDays: shipping.etaMaxDays,
          },
          vatSnapshot: {
            lines: vatLines,
            shipping: shippingBreakdown,
            totals: { netPence, vatPence, grossPence: grandTotalPence },
          },
          shippingAddress,
          billingAddress,
          items: lines,
          bankAccount: bank,
        });

        for (const line of lines) {
          await this.inventory.setHold({
            warehouseId: warehouse.id,
            variantId: line.variantId,
            quantity: 0,
            referenceType: 'CART',
            referenceId: cart.id,
            actorType: 'SYSTEM',
            reason: 'Checkout — cart hold converted to order',
          });
          try {
            await this.inventory.setHold({
              warehouseId: warehouse.id,
              variantId: line.variantId,
              quantity: line.quantity,
              referenceType: 'ORDER',
              referenceId: order.id,
              actorType: input.customerId ? 'CUSTOMER' : 'SYSTEM',
              actorId: input.customerId ?? null,
              reason: `Order ${order.orderNumber}`,
            });
          } catch (error) {
            if (error instanceof InsufficientStockException) {
              const available = Number(error.details.available ?? 0);
              throw new ConflictException(
                available > 0
                  ? `Only ${available} of ${line.productName} (${line.sku}) left in stock. Please update your cart.`
                  : `${line.productName} (${line.sku}) is out of stock. Please update your cart.`,
                'INSUFFICIENT_STOCK',
                {
                  sku: line.sku,
                  variantId: line.variantId,
                  available,
                  requested: line.quantity,
                },
              );
            }
            throw error;
          }
        }

        await this.notifier.notify({
          event: 'ORDER_CREATED',
          to: order.email,
          data: { orderNumber: order.orderNumber, grandTotalPence },
        });

        await this.commerce.writeAudit({
          actorType: input.customerId ? 'CUSTOMER' : 'SYSTEM',
          actorId: input.customerId ?? null,
          action: 'ORDER_CREATED',
          entityType: 'order',
          entityId: order.id,
          after: { orderNumber: order.orderNumber, grandTotalPence },
        });

        return {
          order,
          payment,
          result: {
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            totals: {
              subtotalPence,
              shippingPence: shipping.pricePence,
              vatPence,
              netPence,
              grandTotalPence,
              currency: order.currency,
            },
            bankAccount: payment.bankAccountSnapshot,
            idempotentReplay: false,
          },
        };
      });
    } catch (error) {
      // A concurrent request with the same key may have committed first
      // (we then lose the cart claim or hit the unique key): replay it.
      if (idempotencyKey) {
        const replay = await this.findReplay(
          idempotencyKey,
          email,
          input.customerId,
        );
        if (replay) return replay;
      }
      throw error;
    }

    return placed.result;
  }

  /**
   * Returns the original result for a retried request. A key bound to another
   * shopper's order is rejected rather than leaking that order.
   */
  private async findReplay(
    key: string,
    email: string,
    customerId?: string | null,
  ): Promise<CheckoutResult | null> {
    const existing = await this.commerce.findOrderByIdempotencyKey(key);
    if (!existing) return null;
    const sameShopper =
      existing.email === email &&
      (!customerId ||
        !existing.customerId ||
        existing.customerId === customerId);
    if (!sameShopper) {
      throw new ConflictException(
        'This request key was already used for a different order.',
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
    const payment = await this.commerce.getPaymentByOrderId(existing.id);
    return {
      orderNumber: existing.orderNumber,
      status: existing.status,
      paymentStatus: existing.paymentStatus,
      totals: {
        subtotalPence: existing.subtotalPence,
        shippingPence: existing.shippingPence,
        vatPence: existing.vatPence,
        netPence: existing.netPence,
        grandTotalPence: existing.grandTotalPence,
        currency: existing.currency,
      },
      bankAccount: payment?.bankAccountSnapshot ?? null,
      idempotentReplay: true,
    };
  }

  private resolvePhone(
    contactPhone: string | null | undefined,
    addressPhone: string | null,
  ): string | null {
    const raw = contactPhone?.trim();
    if (!raw) return addressPhone;
    if (!isValidUkPhone(raw)) {
      throw new ValidationException(
        'Invalid UK phone number.',
        'INVALID_PHONE',
      );
    }
    return normalizeUkPhone(raw);
  }
}

/** Order numbers roll over on the UK calendar year, not the server's. */
function ukYear(now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
    }).format(now),
  );
}
