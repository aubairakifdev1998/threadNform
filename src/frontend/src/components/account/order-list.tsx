"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import {
  DEFAULT_ORDER_FILTERS,
  OrderFiltersBar,
  filterOrders,
  type OrderFilterState,
} from "@/components/account/order-filters";
import { OrderOne } from "@/components/commercn/orders/order-01";
import { EmptyState } from "@/components/ui/data-states";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrderSummary } from "@/types/api";

export function OrderList({
  orders,
  emptyTitle = "No orders yet",
  emptyDescription = "When you place an order, it will show up here with payment and delivery status.",
  linkPrefix = "/orders",
  filterable = true,
}: {
  orders: OrderSummary[];
  emptyTitle?: string;
  emptyDescription?: string;
  /** Tracking lives on the public order page. */
  linkPrefix?: string;
  filterable?: boolean;
}) {
  const [filters, setFilters] = useState<OrderFilterState>(DEFAULT_ORDER_FILTERS);

  const filtered = useMemo(
    () => (filterable ? filterOrders(orders, filters) : orders),
    [orders, filters, filterable],
  );

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title={emptyTitle}
        description={emptyDescription}
        action={
          <Link
            href="/shop"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Start shopping
          </Link>
        }
        className="border border-dashed border-border py-10"
      />
    );
  }

  return (
    <div className="space-y-4">
      {filterable ? (
        <OrderFiltersBar
          orders={orders}
          value={filters}
          onChange={setFilters}
        />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No matching orders"
          description="Try a different status, payment filter, or search term."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters(DEFAULT_ORDER_FILTERS)}
            >
              Reset filters
            </Button>
          }
          className="border border-dashed border-border py-10"
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((order) => (
            <li key={order.id}>
              <OrderOne
                order={order}
                href={`${linkPrefix}/${order.orderNumber}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
