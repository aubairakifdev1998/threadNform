"use client";

import Link from "next/link";
import {
  AccountLoading,
  AccountPageHeader,
} from "@/components/account/account-gate";
import { OrderList } from "@/components/account/order-list";
import { useAccountOrders } from "@/components/account/use-account-orders";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AccountOverviewPage() {
  const { loading, user, orders, active, awaitingPayment } = useAccountOrders();

  if (loading) return <AccountLoading />;

  return (
    <div className="space-y-8">
      <AccountPageHeader
        title="Overview"
        description="Track open orders, finish payments, and jump to invoices or history."
        user={user}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Open orders",
            value: String(active.length),
            href: "/account/orders",
          },
          {
            label: "Awaiting payment",
            value: String(awaitingPayment.length),
            href: "/account/payments",
          },
          {
            label: "All orders",
            value: String(orders.length),
            href: "/account/history",
          },
        ].map((stat) => (
          <Link
            key={stat.href}
            href={stat.href}
            className="border border-border bg-card px-4 py-5 transition hover:border-foreground/30"
          >
            <p className="label-eyebrow text-muted-foreground">{stat.label}</p>
            <p className="heading-display mt-2 text-3xl">{stat.value}</p>
          </Link>
        ))}
      </div>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Needs attention
          </h2>
          <Link
            href="/account/orders"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            All orders
          </Link>
        </div>
        <OrderList
          orders={awaitingPayment.length > 0 ? awaitingPayment : active.slice(0, 3)}
          emptyTitle="You're all caught up"
          emptyDescription="No open payments or active orders right now."
        />
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/account/addresses" className={cn(buttonVariants({ variant: "outline" }))}>
          Manage addresses
        </Link>
        <Link href="/account/invoices" className={cn(buttonVariants({ variant: "outline" }))}>
          View invoices
        </Link>
      </div>
    </div>
  );
}
