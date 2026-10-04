"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { AccountLoading, AccountPageHeader } from "@/components/account/account-gate";
import { useAccountOrders } from "@/components/account/use-account-orders";
import { EmptyState } from "@/components/ui/data-states";
import { PriceDisplay } from "@/components/ui/price";
import { PaymentStatusPill } from "@/components/orders/status-pill";
import { formatDate } from "@/lib/orders/presentation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AccountInvoicesPage() {
  const { loading, user, orders } = useAccountOrders();
  if (loading) return <AccountLoading />;

  const invoices = orders.filter((o) => o.status !== "CANCELLED");

  return (
    <div className="space-y-8">
      <AccountPageHeader
        title="Invoices & receipts"
        description="Order receipts for your bank-transfer purchases. Open an order for the full payment trail."
        user={user}
      />

      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Receipts appear after you place an order."
          action={
            <Link
              href="/shop"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Shop now
            </Link>
          }
          className="border border-dashed border-border py-10"
        />
      ) : (
        <ul className="divide-y divide-border border border-border">
          {invoices.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.orderNumber}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition hover:bg-secondary/50 sm:px-5"
              >
                <div>
                  <p className="font-medium">Receipt · {order.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(order.placedAt ?? order.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <PaymentStatusPill status={order.paymentStatus} />
                  <PriceDisplay
                    pence={order.grandTotalPence ?? order.totalPence}
                    size="sm"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
