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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
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
import {
  Permission,
  hasPermission,
} from '../../domain/auth/permissions.js';
import {
  OrderStatus,
  isCancellable,
} from '../../domain/orders/order-status.js';
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from '../../domain/repositories/catalog.repository.js';
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
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import type { AdminAuthenticatedRequest } from '../common/guards/admin-auth.guard.js';
import {
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '../../domain/exceptions/domain.exception.js';
import {
  AdjustInventoryDto,
  CancelOrderDto,
  CreateRefundDto,
  CreateShipmentDto,
  CustomerDiaryQueryDto,
  CustomerListQueryDto,
  CustomerStatusDto,
  RejectPaymentDto,
  TransitionOrderDto,
  UpsertBankAccountDto,
  UpsertSettingDto,
} from './commerce.dto.js';
import { OrderDetailLoader } from './order-detail.loader.js';

@Controller()
export class AdminOrdersController {
  constructor(
    private readonly approvePayment: ApprovePaymentUseCase,
    private readonly rejectPayment: RejectPaymentUseCase,
    private readonly cancelOrder: CancelOrderUseCase,
    private readonly transitionOrder: TransitionOrderStatusUseCase,
    private readonly purgeCustomer: PurgeCustomerUseCase,
    private readonly releaseExpiredHolds: ReleaseExpiredHoldsUseCase,
    private readonly createShipment: CreateShipmentUseCase,
    private readonly createRefund: CreateRefundUseCase,
    private readonly notifier: CustomerNotifier,
    private readonly config: ConfigService,
    private readonly orderDetail: OrderDetailLoader,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(PLATFORM_SETTINGS_REPOSITORY)
    private readonly settings: PlatformSettingsRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(RATE_LIMITER) private readonly rateLimiter: RateLimiter,
  ) {}

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
  async adminGetOrder(@Param('id', new ParseUUIDPipe()) id: string) {
    const order = await this.commerce.getOrderById(id);
    if (!order) throw new NotFoundException('Order', id);
    const { items, payment, proofs, shipments, refunds, timeline, addresses } =
      await this.orderDetail.loadOrderRelations(order.id);
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
    // REFUNDED records money — same privilege as POST .../refunds.
    if (
      dto.status === OrderStatus.REFUNDED &&
      !hasPermission(req.adminUser!.role, Permission.PAYMENT_VERIFY)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
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
        const proofs = await this.orderDetail.withProofUrls(item.proofs);
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

  @Get('admin/audit-logs')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.AUDIT_READ)
  async adminAuditLogs(
    @Query() query: PaginationQueryDto & { q?: string },
  ) {
    const page = normalizePagination(query.page, query.pageSize);
    const result = await this.commerce.listAuditLogs({
      ...page,
      q: query.q,
    });
    return paginated(result.items, result.total, page);
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
  async adminCustomers(@Query() query: CustomerListQueryDto) {
    const page = normalizePagination(query.page, query.pageSize);
    const result = await this.customers.list({ ...page, q: query.q });
    return paginated(result.items, result.total, page);
  }

  /**
   * Customer diary — ranked shoppers by spend/orders with contact details
   * and their most-bought product. Registered before :id so "diary" is not
   * captured as a customer UUID.
   */
  @Get('admin/customers/diary')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORDERS_READ)
  async adminCustomerDiary(@Query() query: CustomerDiaryQueryDto) {
    const page = normalizePagination(query.page, query.pageSize ?? 25);
    const sort =
      query.sort === 'orders' || query.sort === 'recent'
        ? query.sort
        : 'spend';
    const result = await this.commerce.listCustomerDiary({
      ...page,
      q: query.q?.trim() || undefined,
      sort,
    });
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
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
