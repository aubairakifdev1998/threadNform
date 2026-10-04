"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  OrderStatusPill,
  PaymentStatusPill,
} from "@/components/orders/status-pill";
import { PriceDisplay } from "@/components/ui/price";
import {
  customerNextStep,
  formatDate,
  orderStatusMeta,
} from "@/lib/orders/presentation";
import type { OrderSummary } from "@/types/api";
import { cn } from "@/lib/utils";

type OrderOneProps = {
  order: OrderSummary;
  href?: string;
  className?: string;
};

/** CommerCN order-01 summary card, wired to Fareya order summaries. */
export function OrderOne({
  order,
  href,
  className,
}: OrderOneProps) {
  const link = href ?? `/orders/${order.orderNumber}`;
  const next = customerNextStep({
    status: order.status,
    paymentStatus: order.paymentStatus,
  });
  const needsAction =
    order.status !== "CANCELLED" &&
    (order.paymentStatus === "PENDING" ||
      order.paymentStatus === "REJECTED");

  return (
    <Card
      className={cn(
        "w-full border-border/80 shadow-none",
        needsAction && "border-foreground/25 bg-foreground/5",
        className,
      )}
    >
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg font-semibold">
            Order: #{order.orderNumber}
          </CardTitle>
          <Link
            href={link}
            className={cn(
              buttonVariants({
                variant: needsAction ? "default" : "outline",
                size: "sm",
              }),
            )}
          >
            {needsAction ? "Pay now" : "View order"}
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-lg bg-muted p-4 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Order status</p>
            <OrderStatusPill status={order.status} />
          </div>
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Order date</p>
            <p className="text-sm font-medium">
              {formatDate(order.placedAt ?? order.createdAt)}
            </p>
          </div>
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Payment</p>
            <PaymentStatusPill status={order.paymentStatus} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-normal">
            {orderStatusMeta(order.status).label}
          </Badge>
          <span className="text-sm text-muted-foreground">{next.title}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">
            {order.trackingNumber
              ? `${order.carrier ? `${order.carrier} · ` : ""}${order.trackingNumber}`
              : "Tracking updates appear once shipped"}
          </span>
          <PriceDisplay
            pence={order.grandTotalPence ?? order.totalPence}
            size="lg"
          />
        </div>
      </CardContent>
    </Card>
  );
}
