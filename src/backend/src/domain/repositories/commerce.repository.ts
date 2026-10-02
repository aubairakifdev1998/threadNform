import type { OrderStatus } from '../orders/order-status.js';
import type { PaymentStatus } from '../payments/payment-status.js';
import type { UkAddress } from '../shared/uk-address.js';

export type ShippingMethod = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  pricePence: number;
  vatRateId: string;
  etaMinDays: number;
  etaMaxDays: number;
  isActive: boolean;
};

export type BankAccount = {
  id: string;
  bankName: string;
  accountName: string;
  sortCode: string;
  accountNumber: string;
  iban: string | null;
  referenceInstructions: string;
  isActive: boolean;
};

export type Order = {
  id: string;
  orderNumber: string;
  customerId: string | null;
  email: string;
  phone: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shippingStatus: string;
  currency: string;
  subtotalPence: number;
  discountPence: number;
  netPence: number;
  vatPence: number;
  shippingPence: number;
  grandTotalPence: number;
  shippingMethodSnapshot: Record<string, unknown>;
  vatSnapshot: Record<string, unknown>;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  refundedPence: number;
  placedAt: Date;
};

export type OrderItem = {
  id: string;
  orderId: string;
  variantId: string | null;
  productId: string | null;
  productName: string;
  sku: string;
  variantLabel: string | null;
  attributesSnapshot: Record<string, unknown>;
  unitGrossPence: number;
  quantity: number;
  discountPence: number;
  vatRateBps: number;
  vatPence: number;
  netPence: number;
  lineGrossPence: number;
  quantityShipped: number;
  quantityCancelled: number;
  quantityReturned: number;
};

export type Shipment = {
  id: string;
  orderId: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  note: string | null;
  shippedAt: Date;
  items: Array<{ orderItemId: string; quantity: number }>;
};

export type Refund = {
  id: string;
  orderId: string;
  paymentId: string;
  amountPence: number;
  reason: string;
  reference: string | null;
  createdAt: Date;
  items: Array<{
    orderItemId: string;
    quantityCancelled: number;
    quantityReturned: number;
    restocked: boolean;
  }>;
};

export type Payment = {
  id: string;
  orderId: string;
  status: PaymentStatus;
  amountDuePence: number;
  amountClaimedPence: number | null;
  bankAccountSnapshot: Record<string, unknown>;
};

export type PaymentProof = {
  id: string;
  paymentId: string;
  storagePath: string;
  mime: string;
  sizeBytes: number;
  amountClaimedPence: number | null;
  customerReference: string | null;
  customerNote: string | null;
  status: string;
  rejectionReason: string | null;
  uploadedAt: Date;
};

export type CreateOrderInput = {
  orderNumber: string;
  customerId?: string | null;
  email: string;
  phone?: string | null;
  idempotencyKey?: string | null;
  customerNote?: string | null;
  totals: {
    subtotalPence: number;
    discountPence: number;
    netPence: number;
    vatPence: number;
    shippingPence: number;
    grandTotalPence: number;
  };
  shippingMethodSnapshot: Record<string, unknown>;
  vatSnapshot: Record<string, unknown>;
  shippingAddress: UkAddress;
  billingAddress: UkAddress;
  items: Array<{
    variantId: string;
    productId: string;
    productName: string;
    sku: string;
    variantLabel?: string | null;
    attributesSnapshot?: Record<string, unknown>;
    unitGrossPence: number;
    quantity: number;
    vatRateBps: number;
    vatPence: number;
    netPence: number;
    lineGrossPence: number;
  }>;
  bankAccount: BankAccount;
};

export const COMMERCE_REPOSITORY = Symbol('COMMERCE_REPOSITORY');

export interface CommerceRepository {
  listShippingMethods(activeOnly?: boolean): Promise<ShippingMethod[]>;
  getShippingMethod(id: string): Promise<ShippingMethod | null>;
  getActiveBankAccount(): Promise<BankAccount | null>;
  listBankAccounts(): Promise<BankAccount[]>;
  upsertBankAccount(input: {
    id?: string;
    bankName: string;
    accountName: string;
    sortCode: string;
    accountNumber: string;
    iban?: string | null;
    referenceInstructions?: string;
    isActive?: boolean;
  }): Promise<BankAccount>;
  setBankAccountActive(id: string, isActive: boolean): Promise<BankAccount>;
  allocateOrderNumber(year: number): Promise<string>;
  findOrderByIdempotencyKey(key: string): Promise<Order | null>;
  getIdempotencyRecord(
    key: string,
    scope: string,
  ): Promise<{ responseBody: unknown; statusCode: number } | null>;
  saveIdempotencyRecord(input: {
    key: string;
    scope: string;
    requestHash?: string | null;
    responseBody: unknown;
    statusCode: number;
    ttlHours: number;
  }): Promise<void>;
  createOrder(
    input: CreateOrderInput,
  ): Promise<{ order: Order; payment: Payment }>;
  getOrderById(id: string): Promise<Order | null>;
  /** Row-locks the order for the current transaction (serialises admin actions). */
  lockOrder(id: string): Promise<Order | null>;
  getOrderByNumber(orderNumber: string): Promise<Order | null>;
  listOrders(params: {
    page: number;
    pageSize: number;
    customerId?: string;
    email?: string;
    status?: string;
    paymentStatus?: string;
    q?: string;
  }): Promise<{ items: Order[]; total: number }>;
  listOrderItems(orderId: string): Promise<OrderItem[]>;
  updateOrderStatus(input: {
    orderId: string;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    actorType: string;
    actorId?: string | null;
    note?: string | null;
    visibility?: string;
    extra?: Record<string, unknown>;
  }): Promise<Order>;
  getPaymentByOrderId(orderId: string): Promise<Payment | null>;
  getPaymentById(id: string): Promise<Payment | null>;
  updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
    extra?: Record<string, unknown>,
    expectedStatuses?: PaymentStatus[],
  ): Promise<Payment>;
  claimGuestOrder(orderId: string, customerId: string): Promise<Order | null>;
  createPaymentProof(input: {
    paymentId: string;
    storagePath: string;
    mime: string;
    sizeBytes: number;
    amountClaimedPence?: number | null;
    customerReference?: string | null;
    customerNote?: string | null;
  }): Promise<PaymentProof>;
  listPaymentProofs(paymentId: string): Promise<PaymentProof[]>;
  findPaymentProofByPath(
    paymentId: string,
    storagePath: string,
  ): Promise<PaymentProof | null>;
  /** Unpaid orders (no proof uploaded) placed before `before`. */
  listExpiredUnpaidOrderIds(before: Date, limit: number): Promise<string[]>;
  listPaymentQueue(params: {
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
  }>;
  writeAudit(input: {
    actorType: string;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  }): Promise<void>;
  createReturnRequest(input: {
    orderId: string;
    reason?: string | null;
    customerNote?: string | null;
    items: Array<{ orderItemId: string; quantity: number; reason?: string }>;
  }): Promise<{ id: string; status: string }>;
  getDashboardStats(options: {
    lowStockThreshold: number;
  }): Promise<Record<string, number>>;
  purgeOrderCascade(orderId: string): Promise<void>;

  /**
   * Adds to an item's shipped / cancelled / returned counters. Throws a
   * conflict if that would exceed the ordered (or shipped) quantity, so
   * concurrent requests can never over-ship or over-refund.
   */
  adjustItemFulfilment(
    orderItemId: string,
    delta: { shipped?: number; cancelled?: number; returned?: number },
  ): Promise<OrderItem>;
  createShipment(input: {
    orderId: string;
    carrier?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    note?: string | null;
    createdBy?: string | null;
    items: Array<{ orderItemId: string; quantity: number }>;
  }): Promise<Shipment>;
  listShipments(orderId: string): Promise<Shipment[]>;
  /** Adds to orders.refunded_pence; conflict if it would exceed the total. */
  addRefundedAmount(orderId: string, amountPence: number): Promise<Order>;
  createRefund(input: {
    orderId: string;
    paymentId: string;
    amountPence: number;
    reason: string;
    reference?: string | null;
    createdBy?: string | null;
    items: Refund['items'];
  }): Promise<Refund>;
  listRefunds(orderId: string): Promise<Refund[]>;
}
