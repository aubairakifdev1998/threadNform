import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../../domain/notifications/notification.port.js';
import {
  ConflictException,
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
} from '../../../domain/repositories/commerce.repository.js';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../../domain/repositories/inventory.repository.js';
import {
  assertUkShippingAddress,
  type UkAddressInput,
} from '../../../domain/shared/uk-address.js';
import {
  effectiveUnitGrossPence,
  extractVatFromInclusiveGross,
} from '../../../domain/shared/vat.js';

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
};

@Injectable()
export class CheckoutUseCase {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: CartRepository,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(INVENTORY_REPOSITORY) private readonly inventory: InventoryRepository,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    private readonly config: ConfigService,
  ) {}

  async execute(input: CheckoutInput) {
    if (input.idempotencyKey) {
      const existing = await this.commerce.findOrderByIdempotencyKey(
        input.idempotencyKey,
      );
      if (existing) {
        const payment = await this.commerce.getPaymentByOrderId(existing.id);
        return {
          orderNumber: existing.orderNumber,
          status: existing.status,
          paymentStatus: existing.paymentStatus,
          totals: this.totalsFromOrder(existing),
          bankAccount: payment?.bankAccountSnapshot ?? null,
          idempotentReplay: true,
        };
      }
    }

    const cart = await this.carts.findById(input.cartId);
    if (!cart || cart.status !== 'ACTIVE') {
      throw new NotFoundException('Cart', input.cartId);
    }

    if (input.customerId) {
      if (cart.customerId && cart.customerId !== input.customerId) {
        throw new ConflictException(
          'Cart does not belong to this customer',
          'CART_FORBIDDEN',
        );
      }
      if (!cart.customerId) {
        if (!cart.guestTokenHash || !input.guestToken) {
          throw new ValidationException(
            'Guest token required for this cart',
            'GUEST_TOKEN_REQUIRED',
          );
        }
        const secret = this.config.get<string>('cartTokenSecret') ?? 'dev';
        const hash = CheckoutUseCase.hashGuestToken(input.guestToken, secret);
        if (hash !== cart.guestTokenHash) {
          throw new ValidationException(
            'Invalid guest token',
            'GUEST_TOKEN_INVALID',
          );
        }
      }
    } else {
      if (cart.customerId) {
        throw new ValidationException(
          'This cart requires signed-in checkout',
          'CART_REQUIRES_AUTH',
        );
      }
      if (!cart.guestTokenHash) {
        throw new NotFoundException('Cart', input.cartId);
      }
      if (!input.guestToken) {
        throw new ValidationException(
          'Guest token required',
          'GUEST_TOKEN_REQUIRED',
        );
      }
      const secret = this.config.get<string>('cartTokenSecret') ?? 'dev';
      const hash = CheckoutUseCase.hashGuestToken(input.guestToken, secret);
      if (hash !== cart.guestTokenHash) {
        throw new ValidationException(
          'Invalid guest token',
          'GUEST_TOKEN_INVALID',
        );
      }
    }

    const items = await this.carts.listItems(cart.id);
    if (!items.length) {
      throw new ValidationException('Cart is empty', 'CART_INVALID');
    }

    const shipping = await this.commerce.getShippingMethod(input.shippingMethodId);
    if (!shipping || !shipping.isActive) {
      throw new ValidationException('Shipping method unavailable');
    }

    const bank = await this.commerce.getActiveBankAccount();
    if (!bank) {
      throw new ValidationException('Bank account is not configured');
    }

    const shippingAddress = assertUkShippingAddress(input.shippingAddress);
    const billingAddress = assertUkShippingAddress(
      input.billingAddress ?? input.shippingAddress,
    );

    const warehouse = await this.inventory.getDefaultWarehouse();
    if (!warehouse) {
      throw new ValidationException('No default warehouse configured');
    }

    const lineSnapshots: Array<{
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
    }> = [];

    let subtotalPence = 0;
    let itemsNet = 0;
    let itemsVat = 0;
    const vatLines: unknown[] = [];

    for (const item of items) {
      const variant = await this.catalog.getVariantById(item.variantId);
      if (!variant || variant.status !== 'ACTIVE') {
        throw new ConflictException(
          'A cart variant is unavailable',
          'VARIANT_UNAVAILABLE',
          { variantId: item.variantId },
        );
      }

      const product = await this.catalog.getProductById(variant.productId);
      if (!product || product.status !== 'ACTIVE') {
        throw new ConflictException(
          'A cart product is not purchasable',
          'PRODUCT_NOT_PURCHASABLE',
          { productId: variant.productId },
        );
      }

      const price = await this.catalog.getPriceForVariant(variant.id);
      if (!price) {
        throw new ValidationException(`No price for SKU ${variant.sku}`);
      }

      const vatRate = await this.catalog.getVatRate(price.vatRateId);
      if (!vatRate) {
        throw new ValidationException('VAT rate missing');
      }

      const stock = await this.inventory.getItem(warehouse.id, variant.id);
      const available = stock?.available ?? 0;
      if (available < item.quantity) {
        throw new ConflictException(
          `Only ${available} units are available for SKU ${variant.sku}.`,
          'INSUFFICIENT_STOCK',
          {
            sku: variant.sku,
            available,
            requested: item.quantity,
          },
        );
      }

      const unitGross = effectiveUnitGrossPence(
        price.basePricePence,
        price.salePricePence,
      );
      const lineGross = unitGross * item.quantity;
      const breakdown = extractVatFromInclusiveGross(lineGross, vatRate.rateBps);

      subtotalPence += lineGross;
      itemsNet += breakdown.netPence;
      itemsVat += breakdown.vatPence;
      vatLines.push({
        sku: variant.sku,
        ...breakdown,
      });

      lineSnapshots.push({
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

    const shippingVatRate =
      (await this.catalog.getVatRate(shipping.vatRateId)) ??
      (await this.catalog.getDefaultVatRate());
    if (!shippingVatRate) {
      throw new ValidationException('Shipping VAT rate missing');
    }
    const shippingBreakdown = extractVatFromInclusiveGross(
      shipping.pricePence,
      shippingVatRate.rateBps,
    );

    const netPence = itemsNet + shippingBreakdown.netPence;
    const vatPence = itemsVat + shippingBreakdown.vatPence;
    const grandTotalPence = subtotalPence + shipping.pricePence;

    const year = new Date().getFullYear();
    const orderNumber = await this.commerce.allocateOrderNumber(year);

    const { order, payment } = await this.commerce.createOrder({
      orderNumber,
      customerId: input.customerId ?? cart.customerId,
      email: input.email.toLowerCase(),
      phone: input.phone ?? shippingAddress.phone,
      idempotencyKey: input.idempotencyKey ?? null,
      customerNote: input.customerNote ?? null,
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
      items: lineSnapshots,
      bankAccount: bank,
    });

    try {
      // Convert any cart-level holds into order reservations
      for (const line of lineSnapshots) {
        try {
          await this.inventory.release({
            warehouseId: warehouse.id,
            variantId: line.variantId,
            qty: line.quantity,
            referenceType: 'CART',
            referenceId: cart.id,
            actorType: 'SYSTEM',
            reason: 'Checkout — convert cart hold to order',
          });
        } catch {
          // No cart hold present when reserveOnCart is off
        }
        await this.inventory.reserve({
          warehouseId: warehouse.id,
          variantId: line.variantId,
          qty: line.quantity,
          referenceType: 'ORDER',
          referenceId: order.id,
          actorType: 'CUSTOMER',
          actorId: input.customerId ?? null,
        });
      }
    } catch (err) {
      // Release any ORDER reservations already taken, then cancel.
      for (const line of lineSnapshots) {
        try {
          await this.inventory.release({
            warehouseId: warehouse.id,
            variantId: line.variantId,
            qty: line.quantity,
            referenceType: 'ORDER',
            referenceId: order.id,
            actorType: 'SYSTEM',
            reason: 'Checkout reservation rollback',
          });
        } catch {
          // Best-effort rollback
        }
      }
      try {
        await this.commerce.updateOrderStatus({
          orderId: order.id,
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          actorType: 'SYSTEM',
          note: 'Cancelled due to inventory reservation failure',
          visibility: 'INTERNAL',
          extra: {
            cancellationReason: 'OUT_OF_STOCK',
            paymentStatus: 'PENDING',
          },
        });
      } catch {
        // Order may already be cancelled in a race
      }
      throw err;
    }

    await this.carts.markConverted(cart.id);
    await this.commerce.writeAudit({
      actorType: 'CUSTOMER',
      actorId: input.customerId ?? null,
      action: 'ORDER_CREATED',
      entityType: 'order',
      entityId: order.id,
      after: { orderNumber: order.orderNumber, grandTotalPence },
    });

    void this.notifications
      .send({
        event: 'ORDER_CREATED',
        to: order.email,
        data: {
          orderNumber: order.orderNumber,
          grandTotalPence,
          currency: 'GBP',
        },
      })
      .catch(() => undefined);

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totals: {
        subtotalPence,
        shippingPence: shipping.pricePence,
        vatPence,
        netPence,
        grandTotalPence,
        currency: this.config.get<string>('defaultCurrency') ?? 'GBP',
      },
      bankAccount: payment.bankAccountSnapshot,
      idempotentReplay: false,
    };
  }

  static hashGuestToken(token: string, secret: string): string {
    return createHash('sha256').update(`${secret}:${token}`).digest('hex');
  }

  static newGuestToken(): string {
    return randomUUID();
  }

  private totalsFromOrder(order: {
    subtotalPence: number;
    shippingPence: number;
    vatPence: number;
    netPence: number;
    grandTotalPence: number;
    currency: string;
  }) {
    return {
      subtotalPence: order.subtotalPence,
      shippingPence: order.shippingPence,
      vatPence: order.vatPence,
      netPence: order.netPence,
      grandTotalPence: order.grandTotalPence,
      currency: order.currency,
    };
  }
}
