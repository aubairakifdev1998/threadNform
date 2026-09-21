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
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { OrderStatus } from '../../../domain/orders/order-status.js';
import type { PaymentStatus } from '../../../domain/payments/payment-status.js';
import { ValidationException, ConflictException } from '../../../domain/exceptions/domain.exception.js';
import type {
  BankAccount,
  CommerceRepository,
  CreateOrderInput,
  Order,
  OrderItem,
  Payment,
  PaymentProof,
  ShippingMethod,
} from '../../../domain/repositories/commerce.repository.js';
import {
  normalizeOrderExtra,
  normalizePaymentExtra,
} from '../../../domain/shared/commerce-field-map.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import {
  auditLogs,
  inventoryItems,
  orderAddresses,
  orderItems,
  orders,
  orderStatusHistory,
  paymentBankAccounts,
  paymentProofs,
  payments,
  returnItems,
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
      if (!row) throw new ValidationException('Bank account not found', 'NOT_FOUND');
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
    if (!row) throw new ValidationException('Bank account not found', 'NOT_FOUND');
    return this.mapBank(row);
  }

  async allocateOrderNumber(year: number): Promise<string> {
    const result = await this.db.execute(
      sql`select public.allocate_order_number(${year}::int) as order_number`,
    );
    const rows = (result as unknown as { rows?: Array<{ order_number: string }> })
      .rows;
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
      .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.scope, scope)))
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
  }): Promise<{ items: Order[]; total: number }> {
    const filters: SQL[] = [];
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
      filters.push(eq(orders.status, params.status as OrderStatus));
    }
    if (params.paymentStatus) {
      filters.push(
        eq(orders.paymentStatus, params.paymentStatus as PaymentStatus),
      );
    }
    if (params.q) {
      const pattern = `%${params.q}%`;
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
      const pattern = `%${params.q.trim()}%`;
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

    const items = await Promise.all(
      rows.map(async (row) => {
        const proofs = await this.listPaymentProofs(row.payment.id);
        return {
          ...this.mapPayment(row.payment),
          orderNumber: row.orderNumber,
          email: row.email,
          proofs,
          proofCount: proofs.length,
        };
      }),
    );

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

  async getDashboardStats(): Promise<Record<string, number>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      [ordersToday],
      [pendingPayments],
      [processing],
      stockRows,
      revenueRows,
    ] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(orders)
        .where(gte(orders.placedAt, today)),
      this.db
        .select({ value: count() })
        .from(payments)
        .where(inArray(payments.status, ['PROOF_SUBMITTED', 'UNDER_REVIEW'])),
      this.db
        .select({ value: count() })
        .from(orders)
        .where(inArray(orders.status, ['CONFIRMED', 'PROCESSING', 'PACKED'])),
      this.db
        .select({
          onHand: inventoryItems.onHand,
          reserved: inventoryItems.reserved,
        })
        .from(inventoryItems),
      this.db
        .select({ grandTotalPence: orders.grandTotalPence })
        .from(orders)
        .where(
          and(
            eq(orders.paymentStatus, 'VERIFIED'),
            gte(orders.placedAt, today),
          ),
        ),
    ]);

    const lowStockCount = stockRows.filter(
      (row) => row.onHand - row.reserved <= 5,
    ).length;

    const revenuePence = revenueRows.reduce(
      (sum, row) => sum + Number(row.grandTotalPence),
      0,
    );

    return {
      ordersToday: ordersToday?.value ?? 0,
      pendingPaymentVerifications: pendingPayments?.value ?? 0,
      processingOrders: processing?.value ?? 0,
      lowStockVariants: lowStockCount,
      revenueTodayPence: revenuePence,
    };
  }

  async purgeOrderCascade(orderId: string): Promise<void> {
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
      placedAt: row.placedAt,
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
