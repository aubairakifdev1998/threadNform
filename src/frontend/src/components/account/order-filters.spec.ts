import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORDER_FILTERS,
  filterOrders,
} from "@/components/account/order-filters";
import type { OrderSummary } from "@/types/api";

const sample: OrderSummary[] = [
  {
    id: "1",
    orderNumber: "FY-100",
    status: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    totalPence: 1000,
  },
  {
    id: "2",
    orderNumber: "FY-200",
    status: "SHIPPED",
    paymentStatus: "VERIFIED",
    trackingNumber: "TRK123",
    totalPence: 2000,
  },
  {
    id: "3",
    orderNumber: "FY-300",
    status: "CANCELLED",
    paymentStatus: "REJECTED",
    totalPence: 500,
  },
];

describe("filterOrders", () => {
  it("returns all when filters are default", () => {
    expect(filterOrders(sample, DEFAULT_ORDER_FILTERS)).toHaveLength(3);
  });

  it("filters by order status bucket", () => {
    const result = filterOrders(sample, {
      ...DEFAULT_ORDER_FILTERS,
      status: "shipped",
    });
    expect(result.map((o) => o.orderNumber)).toEqual(["FY-200"]);
  });

  it("filters by payment status", () => {
    const result = filterOrders(sample, {
      ...DEFAULT_ORDER_FILTERS,
      payment: "rejected",
    });
    expect(result.map((o) => o.orderNumber)).toEqual(["FY-300"]);
  });

  it("searches order number and tracking", () => {
    expect(
      filterOrders(sample, { ...DEFAULT_ORDER_FILTERS, query: "trk" }).map(
        (o) => o.orderNumber,
      ),
    ).toEqual(["FY-200"]);
    expect(
      filterOrders(sample, { ...DEFAULT_ORDER_FILTERS, query: "fy-100" }).map(
        (o) => o.orderNumber,
      ),
    ).toEqual(["FY-100"]);
  });
});
