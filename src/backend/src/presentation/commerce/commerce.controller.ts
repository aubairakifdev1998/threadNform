import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubmitPaymentProofUseCase } from '../../application/use-cases/payments/submit-payment-proof.use-case.js';
import { GetCurrentUserUseCase } from '../../application/use-cases/auth/get-current-user.use-case.js';
import { OrderStatus } from '../../domain/orders/order-status.js';
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from '../../domain/repositories/catalog.repository.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
} from '../../domain/repositories/commerce.repository.js';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../domain/repositories/inventory.repository.js';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../domain/repositories/unit-of-work.js';
import {
  normalizePagination,
  paginated,
} from '../../domain/shared/pagination.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { User } from '../../domain/entities/user.entity.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import {
  NotFoundException,
  ValidationException,
} from '../../domain/exceptions/domain.exception.js';
import {
  assertSafeStoragePath,
  createOrderViewToken,
  getOrderViewSecret,
} from './order-access.js';
import {
  OrderLookupDto,
  PaymentProofMetaDto,
  ProductListQueryDto,
  ReturnRequestDto,
} from './commerce.dto.js';
import { OrderDetailLoader } from './order-detail.loader.js';

@Controller()
export class CommerceController {
  constructor(
    private readonly submitProof: SubmitPaymentProofUseCase,
    private readonly getCurrentUser: GetCurrentUserUseCase,
    private readonly config: ConfigService,
    private readonly orderDetail: OrderDetailLoader,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

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

    const { items, payment, proofs, shipments, refunds, timeline, addresses } =
      await this.orderDetail.loadOrderRelations(order.id, { customerOnly: true });
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
      bucket: this.orderDetail.proofBucket(),
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
        const returnable = Math.max(
          0,
          item.quantityShipped - item.quantityReturned,
        );
        if (quantity > returnable) {
          throw new ValidationException(
            returnable === 0
              ? `${item.productName} has no shipped units available to return`
              : `You can return at most ${returnable} of ${item.productName}`,
            'RETURN_QUANTITY_INVALID',
            {
              orderItemId,
              ordered: item.quantity,
              shipped: item.quantityShipped,
              returned: item.quantityReturned,
              returnable,
              requested: quantity,
            },
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
