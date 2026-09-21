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
  createOrder(input: CreateOrderInput): Promise<{ order: Order; payment: Payment }>;
  getOrderById(id: string): Promise<Order | null>;
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
  getDashboardStats(): Promise<Record<string, number>>;
  purgeOrderCascade(orderId: string): Promise<void>;
}
