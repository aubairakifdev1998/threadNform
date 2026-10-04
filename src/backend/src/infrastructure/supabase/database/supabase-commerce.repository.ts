import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { OrderStatus } from '../../../domain/orders/order-status.js';
import type { PaymentStatus } from '../../../domain/payments/payment-status.js';
import {
  ValidationException,
  ConflictException,
} from '../../../domain/exceptions/domain.exception.js';
import type {
  BankAccount,
  CommerceRepository,
  CreateOrderInput,
  Order,
  OrderAddressRecord,
  OrderItem,
  OrderTimelineEntry,
  Payment,
  PaymentProof,
  Refund,
  Shipment,
  ShippingMethod,
} from '../../../domain/repositories/commerce.repository.js';
import {
  normalizeOrderExtra,
  normalizePaymentExtra,
} from '../../../domain/shared/commerce-field-map.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import { containsPattern } from '../../drizzle/like.js';
import {
  auditLogs,
  customers,
  inventoryItems,
  orderAddresses,
  orderItems,
  orders,
  orderStatusHistory,
  paymentBankAccounts,
  paymentProofs,
  payments,
  productVariants,
  refundItems,
  refunds,
  returnItems,
  shipmentItems,
  shipments,
  returnRequests,
  shippingMethods,
  idempotencyKeys,
} from '../../drizzle/schema/index.js';

@Injectable()
export class SupabaseCommerceRepository implements CommerceRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listShippingMethods(activeOnly = true): Promise<ShippingMethod[]> {
    const rows = activeOnly
      ? await this.db
          .select()
          .from(shippingMethods)
          .where(eq(shippingMethods.isActive, true))
          .orderBy(asc(shippingMethods.pricePence))
      : await this.db
          .select()
          .from(shippingMethods)
          .orderBy(asc(shippingMethods.pricePence));
    return rows.map((row) => this.mapShipping(row));
  }

  async getShippingMethod(id: string): Promise<ShippingMethod | null> {
    const [row] = await this.db
      .select()
      .from(shippingMethods)
      .where(eq(shippingMethods.id, id))
      .limit(1);
    return row ? this.mapShipping(row) : null;
  }

  async getActiveBankAccount(): Promise<BankAccount | null> {
    const [row] = await this.db
      .select()
      .from(paymentBankAccounts)
      .where(eq(paymentBankAccounts.isActive, true))
      .limit(1);
    return row ? this.mapBank(row) : null;
  }

  async listBankAccounts(): Promise<BankAccount[]> {
    const rows = await this.db
      .select()
      .from(paymentBankAccounts)
      .orderBy(desc(paymentBankAccounts.updatedAt));
    return rows.map((row) => this.mapBank(row));
  }

  async upsertBankAccount(input: {
    id?: string;
    bankName: string;
    accountName: string;
    sortCode: string;
    accountNumber: string;
    iban?: string | null;
    referenceInstructions?: string;
    isActive?: boolean;
  }): Promise<BankAccount> {
    if (input.isActive) {
      await this.db
        .update(paymentBankAccounts)
        .set({ isActive: false, updatedAt: new Date() });
    }

    if (input.id) {
      const [row] = await this.db
        .update(paymentBankAccounts)
        .set({
          bankName: input.bankName,
          accountName: input.accountName,
          sortCode: input.sortCode,
          accountNumber: input.accountNumber,
          iban: input.iban ?? null,
          referenceInstructions:
            input.referenceInstructions ??
            'Use your order number as the payment reference.',
          isActive: input.isActive ?? true,
          updatedAt: new Date(),
        })
        .where(eq(paymentBankAccounts.id, input.id))
        .returning();
      if (!row)
        throw new ValidationException('Bank account not found', 'NOT_FOUND');
      return this.mapBank(row);
    }

    const [row] = await this.db
      .insert(paymentBankAccounts)
      .values({
        bankName: input.bankName,
        accountName: input.accountName,
        sortCode: input.sortCode,
        accountNumber: input.accountNumber,
        iban: input.iban ?? null,
        referenceInstructions:
          input.referenceInstructions ??
          'Use your order number as the payment reference.',
        isActive: input.isActive ?? true,
      })
      .returning();
    return this.mapBank(row);
  }

  async setBankAccountActive(
    id: string,
    isActive: boolean,
  ): Promise<BankAccount> {
    if (isActive) {
      await this.db
        .update(paymentBankAccounts)
        .set({ isActive: false, updatedAt: new Date() });
    }
    const [row] = await this.db
      .update(paymentBankAccounts)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(paymentBankAccounts.id, id))
      .returning();
    if (!row)
      throw new ValidationException('Bank account not found', 'NOT_FOUND');
    return this.mapBank(row);
  }

  async allocateOrderNumber(year: number): Promise<string> {
    const result = await this.db.execute(
      sql`select public.allocate_order_number(${year}::int) as order_number`,
    );
    const rows = (
      result as unknown as { rows?: Array<{ order_number: string }> }
    ).rows;
    const value = rows?.[0]?.order_number;
    if (!value) throw new Error('Failed to allocate order number');
    return String(value);
  }

  async findOrderByIdempotencyKey(key: string): Promise<Order | null> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, key))
      .limit(1);
    return row ? this.mapOrder(row) : null;
  }

  async getIdempotencyRecord(
    key: string,
    scope: string,
  ): Promise<{ responseBody: unknown; statusCode: number } | null> {
    const [row] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(
        and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.scope, scope)),
      )
      .limit(1);
    if (!row) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;
    return {
      responseBody: row.responseBody,
      statusCode: row.statusCode ?? 200,
    };
  }

  async saveIdempotencyRecord(input: {
    key: string;
    scope: string;
    requestHash?: string | null;
    responseBody: unknown;
    statusCode: number;
    ttlHours: number;
  }): Promise<void> {
    const expiresAt = new Date(
      Date.now() + Math.max(1, input.ttlHours) * 60 * 60 * 1000,
    );
    await this.db
      .insert(idempotencyKeys)
      .values({
        key: input.key,
        scope: input.scope,
        requestHash: input.requestHash ?? null,
        responseBody: input.responseBody as Record<string, unknown>,
        statusCode: input.statusCode,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [idempotencyKeys.key, idempotencyKeys.scope],
        set: {
          responseBody: input.responseBody as Record<string, unknown>,
          statusCode: input.statusCode,
          requestHash: input.requestHash ?? null,
          expiresAt,
        },
      });
  }

  async createOrder(
    input: CreateOrderInput,
  ): Promise<{ order: Order; payment: Payment }> {
    const [orderRow] = await this.db
      .insert(orders)
      .values({
        orderNumber: input.orderNumber,
        customerId: input.customerId ?? null,
        email: input.email,
        phone: input.phone ?? null,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        subtotalPence: input.totals.subtotalPence,
        discountPence: input.totals.discountPence,
        netPence: input.totals.netPence,
        vatPence: input.totals.vatPence,
        shippingPence: input.totals.shippingPence,
        grandTotalPence: input.totals.grandTotalPence,
        shippingMethodSnapshot: input.shippingMethodSnapshot,
        vatSnapshot: input.vatSnapshot,
        idempotencyKey: input.idempotencyKey ?? null,
        customerNote: input.customerNote ?? null,
      })
      .returning();

    const order = this.mapOrder(orderRow);

    await this.db.insert(orderItems).values(
      input.items.map((item) => ({
        orderId: order.id,
        variantId: item.variantId,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        variantLabel: item.variantLabel ?? null,
        attributesSnapshot: item.attributesSnapshot ?? {},
        unitGrossPence: item.unitGrossPence,
        quantity: item.quantity,
        discountPence: 0,
        vatRateBps: item.vatRateBps,
        vatPence: item.vatPence,
        netPence: item.netPence,
        lineGrossPence: item.lineGrossPence,
      })),
    );

    await this.db.insert(orderAddresses).values([
      {
        orderId: order.id,
        type: 'SHIPPING',
        fullName: input.shippingAddress.fullName,
        line1: input.shippingAddress.line1,
        line2: input.shippingAddress.line2,
        city: input.shippingAddress.city,
        county: input.shippingAddress.county,
        postcode: input.shippingAddress.postcode,
        postcodeNormalized: input.shippingAddress.postcodeNormalized,
        country: input.shippingAddress.country,
        phone: input.shippingAddress.phone,
      },
      {
        orderId: order.id,
        type: 'BILLING',
        fullName: input.billingAddress.fullName,
        line1: input.billingAddress.line1,
        line2: input.billingAddress.line2,
        city: input.billingAddress.city,
        county: input.billingAddress.county,
        postcode: input.billingAddress.postcode,
        postcodeNormalized: input.billingAddress.postcodeNormalized,
        country: input.billingAddress.country,
        phone: input.billingAddress.phone,
      },
    ]);

    await this.db.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: 'PENDING_PAYMENT',
      actorType: 'CUSTOMER',
      actorId: input.customerId ?? null,
      note: 'Order placed',
      visibility: 'CUSTOMER',
    });

    const bankSnapshot = {
      bankName: input.bankAccount.bankName,
      accountName: input.bankAccount.accountName,
      sortCode: input.bankAccount.sortCode,
      accountNumber: input.bankAccount.accountNumber,
      iban: input.bankAccount.iban,
      referenceInstructions: input.bankAccount.referenceInstructions,
    };

    const [paymentRow] = await this.db
      .insert(payments)
      .values({
        orderId: order.id,
        method: 'BANK_TRANSFER',
        status: 'PENDING',
        amountDuePence: input.totals.grandTotalPence,
        bankAccountSnapshot: bankSnapshot,
      })
      .returning();

    return { order, payment: this.mapPayment(paymentRow) };
  }

  async getOrderById(id: string): Promise<Order | null> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    return row ? this.mapOrder(row) : null;
  }

  async lockOrder(id: string): Promise<Order | null> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1)
      .for('update');
    return row ? this.mapOrder(row) : null;
  }

  async getOrderByNumber(orderNumber: string): Promise<Order | null> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    return row ? this.mapOrder(row) : null;
  }

  async listOrders(params: {
    page: number;
    pageSize: number;
    customerId?: string;
    email?: string;
    status?: string;
    paymentStatus?: string;
    q?: string;
    includeArchived?: boolean;
  }): Promise<{ items: Order[]; total: number }> {
    const filters: SQL[] = [];
    if (!params.includeArchived) {
      filters.push(isNull(orders.archivedAt));
    }
    if (params.customerId && params.email) {
      // Owned orders + unclaimed guest orders placed with this email
      filters.push(
        or(
          eq(orders.customerId, params.customerId),
          and(
            sql`${orders.customerId} is null`,
            eq(orders.email, params.email.trim().toLowerCase()),
          ),
        )!,
      );
    } else if (params.customerId) {
      filters.push(eq(orders.customerId, params.customerId));
    } else if (params.email) {
      filters.push(eq(orders.email, params.email.trim().toLowerCase()));
    }
    if (params.status) {
      // Comma-separated list, e.g. "CONFIRMED,PROCESSING,PACKED".
      const statuses = params.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as OrderStatus[];
      filters.push(inArray(orders.status, statuses));
    }
    if (params.paymentStatus) {
      filters.push(
        eq(orders.paymentStatus, params.paymentStatus as PaymentStatus),
      );
    }
    if (params.q) {
      const pattern = containsPattern(params.q);
      filters.push(
        or(
          ilike(orders.orderNumber, pattern),
          ilike(orders.email, pattern),
          ilike(orders.phone, pattern),
        )!,
      );
    }
    const where = filters.length ? and(...filters) : undefined;
    const offset = (params.page - 1) * params.pageSize;

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.placedAt))
        .limit(params.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(orders).where(where),
    ]);

    return {
      items: items.map((row) => this.mapOrder(row)),
      total: totalRow?.value ?? 0,
    };
  }

  async listCustomerDiary(params: {
    page: number;
    pageSize: number;
    q?: string;
    sort?: 'spend' | 'orders' | 'recent';
  }): Promise<{
    items: Array<{
      customerId: string | null;
      email: string;
      phone: string | null;
      fullName: string | null;
      status: string | null;
      orderCount: number;
      totalSpendPence: number;
      lastOrderAt: Date;
      topProductName: string | null;
      topProductQuantity: number;
    }>;
    total: number;
  }> {
    /**
     * Aggregate in application code so we avoid brittle CTE SQL through
     * drizzle's `execute` binder. Catalogue size for a boutique shop stays
     * well within a single pass over orders + items.
     */
    const sort = params.sort ?? 'spend';
    const q = params.q?.trim().toLowerCase() ?? '';

    const [orderRows, itemRows, customerRows] = await Promise.all([
      this.db
        .select({
          id: orders.id,
          customerId: orders.customerId,
          email: orders.email,
          phone: orders.phone,
          status: orders.status,
          grandTotalPence: orders.grandTotalPence,
          placedAt: orders.placedAt,
        })
        .from(orders)
        .where(isNull(orders.archivedAt)),
      this.db
        .select({
          orderId: orderItems.orderId,
          productName: orderItems.productName,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(
          and(ne(orders.status, 'CANCELLED'), isNull(orders.archivedAt)),
        ),
      this.db
        .select({
          id: customers.id,
          email: customers.email,
          fullName: customers.fullName,
          phone: customers.phone,
          status: customers.status,
        })
        .from(customers),
    ]);

    const customersById = new Map(customerRows.map((c) => [c.id, c]));
    const customersByEmail = new Map(
      customerRows
        .filter((c) => typeof c.email === 'string' && c.email.trim())
        .map((c) => [c.email.trim().toLowerCase(), c]),
    );

    type Acc = {
      customerId: string | null;
      email: string;
      phone: string | null;
      orderCount: number;
      totalSpendPence: number;
      lastOrderAt: Date;
      productQty: Map<string, number>;
    };

    const byEmail = new Map<string, Acc>();
    const toDate = (value: Date | string | null | undefined) => {
      if (!value) return new Date(0);
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? new Date(0) : date;
    };

    for (const order of orderRows) {
      const email =
        typeof order.email === 'string' ? order.email.trim().toLowerCase() : '';
      if (!email) continue;
      const placedAt = toDate(order.placedAt);
      let acc = byEmail.get(email);
      if (!acc) {
        acc = {
          customerId: order.customerId ?? null,
          email,
          phone: order.phone ?? null,
          orderCount: 0,
          totalSpendPence: 0,
          lastOrderAt: placedAt,
          productQty: new Map(),
        };
        byEmail.set(email, acc);
      }
      acc.orderCount += 1;
      if (order.status !== 'CANCELLED') {
        const spend = Number(order.grandTotalPence ?? 0);
        acc.totalSpendPence += Number.isFinite(spend) ? spend : 0;
      }
      if (placedAt.getTime() > acc.lastOrderAt.getTime()) {
        acc.lastOrderAt = placedAt;
      }
      if (!acc.customerId && order.customerId) {
        acc.customerId = order.customerId;
      }
      if ((!acc.phone || !acc.phone.trim()) && order.phone?.trim()) {
        acc.phone = order.phone;
      }
    }

    const orderEmailById = new Map<string, string>();
    for (const order of orderRows) {
      const email =
        typeof order.email === 'string' ? order.email.trim().toLowerCase() : '';
      if (email) orderEmailById.set(order.id, email);
    }

    for (const item of itemRows) {
      const email = orderEmailById.get(item.orderId);
      if (!email) continue;
      const acc = byEmail.get(email);
      if (!acc) continue;
      const name =
        typeof item.productName === 'string' && item.productName.trim()
          ? item.productName.trim()
          : 'Unknown product';
      const qty = Number(item.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      acc.productQty.set(name, (acc.productQty.get(name) ?? 0) + qty);
    }

    let entries = Array.from(byEmail.values()).map((acc) => {
      const profile =
        (acc.customerId ? customersById.get(acc.customerId) : undefined) ??
        customersByEmail.get(acc.email);
      let topProductName: string | null = null;
      let topProductQuantity = 0;
      for (const [name, qty] of acc.productQty) {
        if (qty > topProductQuantity) {
          topProductName = name;
          topProductQuantity = qty;
        }
      }
      return {
        customerId: profile?.id ?? acc.customerId,
        email: acc.email,
        phone: profile?.phone ?? acc.phone,
        fullName: profile?.fullName ?? null,
        status: profile?.status ?? null,
        orderCount: acc.orderCount,
        totalSpendPence: acc.totalSpendPence,
        lastOrderAt: acc.lastOrderAt,
        topProductName,
        topProductQuantity,
      };
    });

    if (q) {
      entries = entries.filter(
        (entry) =>
          entry.email.includes(q) ||
          (entry.phone ?? '').toLowerCase().includes(q) ||
          (entry.fullName ?? '').toLowerCase().includes(q),
      );
    }

    entries.sort((a, b) => {
      if (sort === 'orders') {
        return (
          b.orderCount - a.orderCount ||
          b.lastOrderAt.getTime() - a.lastOrderAt.getTime()
        );
      }
      if (sort === 'recent') {
        return b.lastOrderAt.getTime() - a.lastOrderAt.getTime();
      }
      return (
        b.totalSpendPence - a.totalSpendPence || b.orderCount - a.orderCount
      );
    });

    const total = entries.length;
    const offset = (params.page - 1) * params.pageSize;
    const items = entries.slice(offset, offset + params.pageSize);

    return { items, total };
  }

  async archiveOrdersByPeriod(params: {
    from: Date;
    toExclusive: Date;
    dryRun?: boolean;
  }): Promise<{ orderCount: number; from: Date; toExclusive: Date }> {
    if (!(params.from instanceof Date) || Number.isNaN(params.from.getTime())) {
      throw new ValidationException('Invalid archive start date', 'BAD_REQUEST');
    }
    if (
      !(params.toExclusive instanceof Date) ||
      Number.isNaN(params.toExclusive.getTime())
    ) {
      throw new ValidationException('Invalid archive end date', 'BAD_REQUEST');
    }
    if (params.toExclusive.getTime() <= params.from.getTime()) {
      throw new ValidationException(
        'Archive end date must be on or after the start date',
        'BAD_REQUEST',
      );
    }

    const inPeriod = and(
      isNull(orders.archivedAt),
      gte(orders.placedAt, params.from),
      lt(orders.placedAt, params.toExclusive),
    );

    const [countRow] = await this.db
      .select({ value: count() })
      .from(orders)
      .where(inPeriod);
    const orderCount = Number(countRow?.value ?? 0);

    if (!params.dryRun && orderCount > 0) {
      const now = new Date();
      await this.db
        .update(orders)
        .set({ archivedAt: now, updatedAt: now })
        .where(inPeriod);
    }

    return {
      orderCount,
      from: params.from,
      toExclusive: params.toExclusive,
    };
  }

  async listOrderTimeline(
    orderId: string,
    options: { customerOnly?: boolean } = {},
  ): Promise<OrderTimelineEntry[]> {
    const rows = await this.db
      .select()
      .from(orderStatusHistory)
      .where(
        options.customerOnly
          ? and(
              eq(orderStatusHistory.orderId, orderId),
              eq(orderStatusHistory.visibility, 'CUSTOMER'),
            )
          : eq(orderStatusHistory.orderId, orderId),
      )
      .orderBy(asc(orderStatusHistory.createdAt));
    return rows.map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus ?? null,
      toStatus: row.toStatus,
      actorType: row.actorType,
      note: row.note ?? null,
      visibility: row.visibility,
      createdAt: row.createdAt,
    }));
  }

  async listOrderAddresses(orderId: string): Promise<OrderAddressRecord[]> {
    const rows = await this.db
      .select()
      .from(orderAddresses)
      .where(eq(orderAddresses.orderId, orderId));
    return rows.map((row) => ({
      type: row.type,
      fullName: row.fullName,
      line1: row.line1,
      line2: row.line2 ?? null,
      city: row.city,
      county: row.county ?? null,
      postcode: row.postcode,
      country: row.country,
      phone: row.phone ?? null,
    }));
  }

  async listOrderItems(orderId: string): Promise<OrderItem[]> {
    const rows = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    return rows.map((row) => this.mapOrderItem(row));
  }

  async updateOrderStatus(input: {
    orderId: string;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    actorType: string;
    actorId?: string | null;
    note?: string | null;
    visibility?: string;
    extra?: Record<string, unknown>;
  }): Promise<Order> {
    const [row] = await this.db
      .update(orders)
      .set({
        status: input.toStatus,
        updatedAt: new Date(),
        ...normalizeOrderExtra(input.extra),
      })
      .where(
        and(eq(orders.id, input.orderId), eq(orders.status, input.fromStatus)),
      )
      .returning();

    if (!row) {
      throw new ConflictException(
        'Order status update conflict',
        'ORDER_STATUS_CONFLICT',
      );
    }

    await this.db.insert(orderStatusHistory).values({
      orderId: input.orderId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorType: input.actorType as 'CUSTOMER' | 'ADMIN' | 'SYSTEM',
      actorId: input.actorId ?? null,
      note: input.note ?? null,
      visibility:
        (input.visibility as 'CUSTOMER' | 'ADMIN' | 'INTERNAL') ?? 'CUSTOMER',
    });

    return this.mapOrder(row);
  }

  async getPaymentByOrderId(orderId: string): Promise<Payment | null> {
    const [row] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .limit(1);
    return row ? this.mapPayment(row) : null;
  }

  async getPaymentById(id: string): Promise<Payment | null> {
    const [row] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);
    return row ? this.mapPayment(row) : null;
  }

  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
    extra: Record<string, unknown> = {},
    expectedStatuses?: PaymentStatus[],
  ): Promise<Payment> {
    const conditions = [eq(payments.id, paymentId)];
    if (expectedStatuses?.length) {
      conditions.push(inArray(payments.status, expectedStatuses));
    }
    const [row] = await this.db
      .update(payments)
      .set({
        status,
        updatedAt: new Date(),
        ...normalizePaymentExtra(extra),
      })
      .where(and(...conditions))
      .returning();

    if (!row) {
      throw new ConflictException(
        'Payment status update conflict',
        'PAYMENT_STATUS_CONFLICT',
      );
    }
    // Keep the order's denormalised payment_status in step with the payment.
    await this.db
      .update(orders)
      .set({ paymentStatus: status, updatedAt: new Date() })
      .where(eq(orders.id, row.orderId));
    return this.mapPayment(row);
  }

  async claimGuestOrder(
    orderId: string,
    customerId: string,
  ): Promise<Order | null> {
    const [row] = await this.db
      .update(orders)
      .set({ customerId, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), sql`${orders.customerId} is null`))
      .returning();
    return row ? this.mapOrder(row) : null;
  }

  async createPaymentProof(input: {
    paymentId: string;
    storagePath: string;
    mime: string;
    sizeBytes: number;
    amountClaimedPence?: number | null;
    customerReference?: string | null;
    customerNote?: string | null;
  }): Promise<PaymentProof> {
    const [row] = await this.db
      .insert(paymentProofs)
      .values({
        paymentId: input.paymentId,
        storagePath: input.storagePath,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        amountClaimedPence: input.amountClaimedPence ?? null,
        customerReference: input.customerReference ?? null,
        customerNote: input.customerNote ?? null,
        status: 'UPLOADED',
      })
      .returning();
    return this.mapProof(row);
  }

  async listPaymentProofs(paymentId: string): Promise<PaymentProof[]> {
    const rows = await this.db
      .select()
      .from(paymentProofs)
      .where(eq(paymentProofs.paymentId, paymentId))
      .orderBy(desc(paymentProofs.uploadedAt));
    return rows.map((row) => this.mapProof(row));
  }

  async findPaymentProofByPath(
    paymentId: string,
    storagePath: string,
  ): Promise<PaymentProof | null> {
    const [row] = await this.db
      .select()
      .from(paymentProofs)
      .where(
        and(
          eq(paymentProofs.paymentId, paymentId),
          eq(paymentProofs.storagePath, storagePath),
        ),
      )
      .limit(1);
    return row ? this.mapProof(row) : null;
  }

  async listExpiredUnpaidOrderIds(
    before: Date,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'PENDING_PAYMENT'),
          eq(orders.paymentStatus, 'PENDING'),
          lt(orders.placedAt, before),
        ),
      )
      .orderBy(asc(orders.placedAt))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  async listPaymentQueue(params: {
    page: number;
    pageSize: number;
    status?: string;
    q?: string;
    hasProof?: boolean;
  }): Promise<{
    items: Array<
      Payment & {
        orderNumber: string;
        email: string;
        proofs: PaymentProof[];
        proofCount: number;
      }
    >;
    total: number;
  }> {
    const filters: SQL[] = [];
    const status = params.status?.trim();

    if (!status || status === 'queue') {
      filters.push(
        inArray(payments.status, ['PROOF_SUBMITTED', 'UNDER_REVIEW']),
      );
    } else if (status !== 'all') {
      filters.push(eq(payments.status, status as PaymentStatus));
    }

    if (params.q?.trim()) {
      const pattern = containsPattern(params.q.trim());
      filters.push(
        or(
          ilike(orders.orderNumber, pattern),
          ilike(orders.email, pattern),
          ilike(orders.phone, pattern),
        )!,
      );
    }

    if (params.hasProof === true) {
      filters.push(
        sql`exists (
          select 1 from ${paymentProofs}
          where ${paymentProofs.paymentId} = ${payments.id}
        )`,
      );
    } else if (params.hasProof === false) {
      filters.push(
        sql`not exists (
          select 1 from ${paymentProofs}
          where ${paymentProofs.paymentId} = ${payments.id}
        )`,
      );
    }

    // Archived period orders stay out of the payments queue/portal.
    filters.push(isNull(orders.archivedAt));

    const where = filters.length ? and(...filters) : undefined;
    const offset = (params.page - 1) * params.pageSize;

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({
          payment: payments,
          orderNumber: orders.orderNumber,
          email: orders.email,
        })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .where(where)
        .orderBy(desc(payments.updatedAt))
        .limit(params.pageSize)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .where(where),
    ]);

    // One query for every proof on the page, not one per payment.
    const paymentIds = rows.map((row) => row.payment.id);
    const proofRows = paymentIds.length
      ? await this.db
          .select()
          .from(paymentProofs)
          .where(inArray(paymentProofs.paymentId, paymentIds))
          .orderBy(desc(paymentProofs.uploadedAt))
      : [];
    const proofsByPayment = new Map<string, PaymentProof[]>();
    for (const row of proofRows) {
      const list = proofsByPayment.get(row.paymentId) ?? [];
      list.push(this.mapProof(row));
      proofsByPayment.set(row.paymentId, list);
    }

    const items = rows.map((row) => {
      const proofs = proofsByPayment.get(row.payment.id) ?? [];
      return {
        ...this.mapPayment(row.payment),
        orderNumber: row.orderNumber,
        email: row.email,
        proofs,
        proofCount: proofs.length,
      };
    });

    return {
      items,
      total: totalRow?.value ?? 0,
    };
  }

  async writeAudit(input: {
    actorType: string;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    await this.db.insert(auditLogs).values({
      actorType: input.actorType as 'CUSTOMER' | 'ADMIN' | 'SYSTEM',
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
    });
  }

  async listAuditLogs(params: {
    page: number;
    pageSize: number;
    q?: string;
  }) {
    const q = params.q?.trim();
    const where = q
      ? or(
          ilike(auditLogs.action, containsPattern(q)),
          ilike(auditLogs.entityType, containsPattern(q)),
          ilike(auditLogs.entityId, containsPattern(q)),
        )
      : undefined;
    const [items, [totalRow]] = await Promise.all([
      this.db
        .select({
          id: auditLogs.id,
          actorType: auditLogs.actorType,
          actorId: auditLogs.actorId,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      this.db.select({ value: count() }).from(auditLogs).where(where),
    ]);
    return {
      items: items.map((row) => ({
        id: row.id,
        actorType: row.actorType,
        actorId: row.actorId ?? null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId ?? null,
        createdAt: row.createdAt,
      })),
      total: totalRow?.value ?? 0,
    };
  }

  async createReturnRequest(input: {
    orderId: string;
    reason?: string | null;
    customerNote?: string | null;
    items: Array<{ orderItemId: string; quantity: number; reason?: string }>;
  }): Promise<{ id: string; status: string }> {
    const [row] = await this.db
      .insert(returnRequests)
      .values({
        orderId: input.orderId,
        reason: input.reason ?? null,
        customerNote: input.customerNote ?? null,
        status: 'REQUESTED',
      })
      .returning({ id: returnRequests.id, status: returnRequests.status });

    if (input.items.length) {
      await this.db.insert(returnItems).values(
        input.items.map((i) => ({
          returnRequestId: row.id,
          orderItemId: i.orderItemId,
          quantity: i.quantity,
          reason: i.reason ?? null,
        })),
      );
    }

    return { id: row.id, status: row.status };
  }

  async getDashboardStats(options: {
    lowStockThreshold: number;
  }): Promise<Record<string, number>> {
    const today = startOfUkDay(new Date());

    const [
      [ordersToday],
      [pendingPayments],
      [processing],
      [lowStock],
      [revenue],
    ] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(orders)
        .where(and(gte(orders.placedAt, today), isNull(orders.archivedAt))),
      this.db
        .select({ value: count() })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .where(
          and(
            inArray(payments.status, ['PROOF_SUBMITTED', 'UNDER_REVIEW']),
            isNull(orders.archivedAt),
          ),
        ),
      this.db
        .select({ value: count() })
        .from(orders)
        .where(
          and(
            inArray(orders.status, [
              'CONFIRMED',
              'PROCESSING',
              'PACKED',
              'PARTIALLY_SHIPPED',
            ]),
            isNull(orders.archivedAt),
          ),
        ),
      this.db
        .select({ value: count() })
        .from(inventoryItems)
        .innerJoin(
          productVariants,
          eq(inventoryItems.variantId, productVariants.id),
        )
        .where(
          and(
            ne(productVariants.status, 'ARCHIVED'),
            sql`${inventoryItems.onHand} - ${inventoryItems.reserved} <= ${options.lowStockThreshold}`,
          ),
        ),
      this.db
        .select({
          value: sql<string>`coalesce(sum(${orders.grandTotalPence}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.paymentStatus, 'VERIFIED'),
            gte(orders.placedAt, today),
            isNull(orders.archivedAt),
          ),
        ),
    ]);

    return {
      ordersToday: ordersToday?.value ?? 0,
      pendingPaymentVerifications: pendingPayments?.value ?? 0,
      processingOrders: processing?.value ?? 0,
      lowStockVariants: lowStock?.value ?? 0,
      revenueTodayPence: Number(revenue?.value ?? 0),
    };
  }

  async adjustItemFulfilment(
    orderItemId: string,
    delta: { shipped?: number; cancelled?: number; returned?: number },
  ): Promise<OrderItem> {
    const shipped = delta.shipped ?? 0;
    const cancelled = delta.cancelled ?? 0;
    const returned = delta.returned ?? 0;
    const [row] = await this.db
      .update(orderItems)
      .set({
        quantityShipped: sql`${orderItems.quantityShipped} + ${shipped}`,
        quantityCancelled: sql`${orderItems.quantityCancelled} + ${cancelled}`,
        quantityReturned: sql`${orderItems.quantityReturned} + ${returned}`,
      })
      .where(
        and(
          eq(orderItems.id, orderItemId),
          sql`${orderItems.quantityShipped} + ${shipped} + ${orderItems.quantityCancelled} + ${cancelled} <= ${orderItems.quantity}`,
          sql`${orderItems.quantityReturned} + ${returned} <= ${orderItems.quantityShipped} + ${shipped}`,
        ),
      )
      .returning();
    if (!row) {
      throw new ConflictException(
        'That quantity is no longer available for this item. Refresh and try again.',
        'ITEM_QUANTITY_CONFLICT',
        { orderItemId },
      );
    }
    return this.mapOrderItem(row);
  }

  async createShipment(input: {
    orderId: string;
    carrier?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    note?: string | null;
    createdBy?: string | null;
    items: Array<{ orderItemId: string; quantity: number }>;
  }): Promise<Shipment> {
    const [row] = await this.db
      .insert(shipments)
      .values({
        orderId: input.orderId,
        carrier: input.carrier ?? null,
        trackingNumber: input.trackingNumber ?? null,
        trackingUrl: input.trackingUrl ?? null,
        note: input.note ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    await this.db
      .insert(shipmentItems)
      .values(input.items.map((item) => ({ shipmentId: row.id, ...item })));
    return {
      id: row.id,
      orderId: row.orderId,
      carrier: row.carrier ?? null,
      trackingNumber: row.trackingNumber ?? null,
      trackingUrl: row.trackingUrl ?? null,
      note: row.note ?? null,
      shippedAt: row.shippedAt,
      items: input.items,
    };
  }

  async listShipments(orderId: string): Promise<Shipment[]> {
    const rows = await this.db
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, orderId))
      .orderBy(asc(shipments.shippedAt));
    if (!rows.length) return [];
    const items = await this.db
      .select()
      .from(shipmentItems)
      .where(
        inArray(
          shipmentItems.shipmentId,
          rows.map((r) => r.id),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      carrier: row.carrier ?? null,
      trackingNumber: row.trackingNumber ?? null,
      trackingUrl: row.trackingUrl ?? null,
      note: row.note ?? null,
      shippedAt: row.shippedAt,
      items: items
        .filter((i) => i.shipmentId === row.id)
        .map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })),
    }));
  }

  async addRefundedAmount(
    orderId: string,
    amountPence: number,
  ): Promise<Order> {
    const [row] = await this.db
      .update(orders)
      .set({
        refundedPence: sql`${orders.refundedPence} + ${amountPence}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, orderId),
          sql`${orders.refundedPence} + ${amountPence} <= ${orders.grandTotalPence}`,
        ),
      )
      .returning();
    if (!row) {
      throw new ConflictException(
        'The refund would exceed the amount paid for this order.',
        'REFUND_EXCEEDS_PAID',
      );
    }
    return this.mapOrder(row);
  }

  async createRefund(input: {
    orderId: string;
    paymentId: string;
    amountPence: number;
    reason: string;
    reference?: string | null;
    createdBy?: string | null;
    items: Refund['items'];
  }): Promise<Refund> {
    const [row] = await this.db
      .insert(refunds)
      .values({
        orderId: input.orderId,
        paymentId: input.paymentId,
        amountPence: input.amountPence,
        reason: input.reason,
        reference: input.reference ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    if (input.items.length) {
      await this.db
        .insert(refundItems)
        .values(input.items.map((item) => ({ refundId: row.id, ...item })));
    }
    return {
      id: row.id,
      orderId: row.orderId,
      paymentId: row.paymentId,
      amountPence: row.amountPence,
      reason: row.reason,
      reference: row.reference ?? null,
      createdAt: row.createdAt,
      items: input.items,
    };
  }

  async listRefunds(orderId: string): Promise<Refund[]> {
    const rows = await this.db
      .select()
      .from(refunds)
      .where(eq(refunds.orderId, orderId))
      .orderBy(asc(refunds.createdAt));
    if (!rows.length) return [];
    const items = await this.db
      .select()
      .from(refundItems)
      .where(
        inArray(
          refundItems.refundId,
          rows.map((r) => r.id),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      paymentId: row.paymentId,
      amountPence: row.amountPence,
      reason: row.reason,
      reference: row.reference ?? null,
      createdAt: row.createdAt,
      items: items
        .filter((i) => i.refundId === row.id)
        .map((i) => ({
          orderItemId: i.orderItemId,
          quantityCancelled: i.quantityCancelled,
          quantityReturned: i.quantityReturned,
          restocked: i.restocked,
        })),
    }));
  }

  async purgeOrderCascade(orderId: string): Promise<void> {
    const shipmentRows = await this.db
      .select({ id: shipments.id })
      .from(shipments)
      .where(eq(shipments.orderId, orderId));
    if (shipmentRows.length) {
      await this.db.delete(shipments).where(eq(shipments.orderId, orderId));
    }
    const refundRows = await this.db
      .select({ id: refunds.id })
      .from(refunds)
      .where(eq(refunds.orderId, orderId));
    if (refundRows.length) {
      await this.db.delete(refunds).where(eq(refunds.orderId, orderId));
    }

    const returns = await this.db
      .select({ id: returnRequests.id })
      .from(returnRequests)
      .where(eq(returnRequests.orderId, orderId));
    const returnIds = returns.map((r) => r.id);
    if (returnIds.length) {
      await this.db
        .delete(returnItems)
        .where(inArray(returnItems.returnRequestId, returnIds));
      await this.db
        .delete(returnRequests)
        .where(eq(returnRequests.orderId, orderId));
    }

    const paymentRows = await this.db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.orderId, orderId));
    const paymentIds = paymentRows.map((p) => p.id);
    if (paymentIds.length) {
      await this.db
        .delete(paymentProofs)
        .where(inArray(paymentProofs.paymentId, paymentIds));
      await this.db.delete(payments).where(eq(payments.orderId, orderId));
    }

    await this.db
      .delete(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId));
    await this.db
      .delete(orderAddresses)
      .where(eq(orderAddresses.orderId, orderId));
    await this.db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await this.db.delete(orders).where(eq(orders.id, orderId));
  }

  private mapShipping(
    row: typeof shippingMethods.$inferSelect,
  ): ShippingMethod {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      pricePence: row.pricePence,
      vatRateId: row.vatRateId,
      etaMinDays: row.etaMinDays,
      etaMaxDays: row.etaMaxDays,
      isActive: row.isActive,
    };
  }

  private mapBank(row: typeof paymentBankAccounts.$inferSelect): BankAccount {
    return {
      id: row.id,
      bankName: row.bankName,
      accountName: row.accountName,
      sortCode: row.sortCode,
      accountNumber: row.accountNumber,
      iban: row.iban ?? null,
      referenceInstructions: row.referenceInstructions,
      isActive: row.isActive,
    };
  }

  private mapOrder(row: typeof orders.$inferSelect): Order {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      customerId: row.customerId ?? null,
      email: row.email,
      phone: row.phone ?? null,
      status: row.status as OrderStatus,
      paymentStatus: row.paymentStatus as PaymentStatus,
      shippingStatus: row.shippingStatus,
      currency: row.currency,
      subtotalPence: row.subtotalPence,
      discountPence: row.discountPence,
      netPence: row.netPence,
      vatPence: row.vatPence,
      shippingPence: row.shippingPence,
      grandTotalPence: row.grandTotalPence,
      shippingMethodSnapshot:
        (row.shippingMethodSnapshot as Record<string, unknown>) ?? {},
      vatSnapshot: (row.vatSnapshot as Record<string, unknown>) ?? {},
      carrier: row.carrier ?? null,
      trackingNumber: row.trackingNumber ?? null,
      trackingUrl: row.trackingUrl ?? null,
      refundedPence: row.refundedPence ?? 0,
      placedAt: row.placedAt,
      archivedAt: row.archivedAt ? new Date(row.archivedAt) : null,
    };
  }

  private mapOrderItem(row: typeof orderItems.$inferSelect): OrderItem {
    return {
      id: row.id,
      orderId: row.orderId,
      variantId: row.variantId ?? null,
      productId: row.productId ?? null,
      productName: row.productName,
      sku: row.sku,
      variantLabel: row.variantLabel ?? null,
      attributesSnapshot:
        (row.attributesSnapshot as Record<string, unknown>) ?? {},
      unitGrossPence: row.unitGrossPence,
      quantity: row.quantity,
      discountPence: row.discountPence,
      vatRateBps: row.vatRateBps,
      vatPence: row.vatPence,
      netPence: row.netPence,
      lineGrossPence: row.lineGrossPence,
      quantityShipped: row.quantityShipped ?? 0,
      quantityCancelled: row.quantityCancelled ?? 0,
      quantityReturned: row.quantityReturned ?? 0,
    };
  }

  private mapPayment(row: typeof payments.$inferSelect): Payment {
    return {
      id: row.id,
      orderId: row.orderId,
      status: row.status as PaymentStatus,
      amountDuePence: row.amountDuePence,
      amountClaimedPence: row.amountClaimedPence ?? null,
      bankAccountSnapshot:
        (row.bankAccountSnapshot as Record<string, unknown>) ?? {},
    };
  }

  private mapProof(row: typeof paymentProofs.$inferSelect): PaymentProof {
    return {
      id: row.id,
      paymentId: row.paymentId,
      storagePath: row.storagePath,
      mime: row.mime,
      sizeBytes: row.sizeBytes,
      amountClaimedPence: row.amountClaimedPence ?? null,
      customerReference: row.customerReference ?? null,
      customerNote: row.customerNote ?? null,
      status: row.status,
      rejectionReason: row.rejectionReason ?? null,
      uploadedAt: row.uploadedAt,
    };
  }
}

/** Midnight in Europe/London for the given instant (handles GMT/BST). */
function startOfUkDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsedMs =
    ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 +
    now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}
