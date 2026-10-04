"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CreditCard,
  PackageCheck,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PriceDisplay } from "@/components/ui/price";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/status/status-badges";
import { EmptyState, ErrorState } from "@/components/ui/data-states";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminDashboard, useAdminOrders } from "@/lib/query/admin";
import { formatDate } from "@/lib/orders/presentation";
import { cn } from "@/lib/utils";
import type { AdminDashboard } from "@/types/api";

/**
 * Ecommerce-dashboard style ops home: KPI strip, attention queues, recent
 * orders. Point-in-time counters only — no invented time-series charts.
 */

function KpiCard({
  label,
  children,
  icon: Icon,
  hint,
  index = 0,
}: {
  label: string;
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  index?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="h-full shadow-none transition-shadow hover:shadow-e1">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardDescription className="text-sm">{label}</CardDescription>
          <span className="rounded-md border border-border bg-secondary p-1.5 text-muted-foreground">
            <Icon className="size-3.5" aria-hidden />
          </span>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-numeric text-2xl font-semibold tracking-tight sm:text-3xl">
            {children}
          </div>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function AdminDashboardPanel() {
  const dashboard = useAdminDashboard();
  const recentOrders = useAdminOrders({ page: 1, pageSize: 8 });
  const stats: AdminDashboard | null = dashboard.data ?? null;

  const paymentsToReview =
    stats?.pendingPaymentVerifications ?? stats?.pendingPayments;

  const attention = [
    {
      label: "Payments to review",
      value: paymentsToReview,
      href: "/admin/orders?queue=review",
      icon: CreditCard,
      body: "Bank transfers waiting on your decision.",
      cta: "Review payments",
    },
    {
      label: "Orders to fulfil",
      value: stats?.processingOrders,
      href: "/admin/orders?queue=fulfil",
      icon: PackageCheck,
      body: "Paid and not yet shipped.",
      cta: "Open fulfilment",
    },
    {
      label: "Low stock SKUs",
      value: stats?.lowStockVariants,
      href: "/admin/inventory",
      icon: Boxes,
      body: "At or below the restock threshold.",
      cta: "Adjust stock",
    },
  ];

  const needsAttention = attention.filter(
    (item) => typeof item.value === "number" && item.value > 0,
  );

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Dashboard"
        description="Today's trading and the queues that need you."
        actions={
          <Link
            href="/admin/orders"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            All orders
            <ArrowRight aria-hidden />
          </Link>
        }
      />

      <section aria-labelledby="dashboard-kpis">
        <h2 id="dashboard-kpis" className="sr-only">
          Key figures
        </h2>
        {dashboard.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index}>
                <CardContent className="space-y-3 pt-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : dashboard.isError ? (
          <Card>
            <ErrorState
              error={dashboard.error}
              onRetry={() => void dashboard.refetch()}
              description="Today's figures couldn't be loaded. Orders and payments are unaffected."
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Orders today"
              icon={Receipt}
              hint="Placed in the last 24 hours"
              index={0}
            >
              {stats?.ordersToday ?? 0}
            </KpiCard>
            <KpiCard
              label="Revenue today"
              icon={TrendingUp}
              hint="Verified payments only"
              index={1}
            >
              <PriceDisplay
                pence={stats?.revenueTodayPence ?? 0}
                size="lg"
                className="text-2xl font-semibold tracking-tight sm:text-3xl"
              />
            </KpiCard>
            <KpiCard
              label="Payments queue"
              icon={CreditCard}
              hint="Awaiting verification"
              index={2}
            >
              {paymentsToReview ?? 0}
            </KpiCard>
            <KpiCard
              label="To fulfil"
              icon={PackageCheck}
              hint="Paid, not shipped"
              index={3}
            >
              {stats?.processingOrders ?? 0}
            </KpiCard>
          </div>
        )}
      </section>

      {!dashboard.isPending && !dashboard.isError ? (
        <section className="space-y-3" aria-labelledby="dashboard-attention">
          <h2
            id="dashboard-attention"
            className="label-meta text-muted-foreground"
          >
            Needs attention
          </h2>
          {needsAttention.length === 0 ? (
            <Card className="shadow-none">
              <EmptyState
                icon={PackageCheck}
                title="Nothing waiting on you"
                description="No payments to review, no orders to pack, and nothing running low on stock."
                className="py-10"
              />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {needsAttention.map((item) => {
                const Icon = item.icon;
                return (
                  <Card
                    key={item.label}
                    className="border-foreground/20 bg-background shadow-none transition-shadow hover:shadow-e1"
                  >
                    <CardHeader className="pb-3">
                      <CardDescription className="flex items-center gap-2">
                        <Icon className="size-4" aria-hidden />
                        {item.label}
                      </CardDescription>
                      <CardTitle className="text-numeric text-3xl">
                        {item.value}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {item.body}
                      </p>
                      <Link
                        href={item.href}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                        )}
                      >
                        {item.cta}
                        <ArrowRight aria-hidden />
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="dashboard-recent">
        <div className="flex items-end justify-between gap-4">
          <h2 id="dashboard-recent" className="label-meta text-muted-foreground">
            Recent orders
          </h2>
          <Link
            href="/admin/orders"
            className="text-sm underline-offset-4 hover:underline"
          >
            View all
          </Link>
        </div>

        <Card className="overflow-hidden shadow-none">
          {recentOrders.isPending ? (
            <div
              className="divide-y divide-border"
              role="status"
              aria-label="Loading latest orders"
            >
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-4 px-4 py-3.5"
                >
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : recentOrders.isError ? (
            <ErrorState
              error={recentOrders.error}
              onRetry={() => void recentOrders.refetch()}
              description="The latest orders couldn't be loaded."
            />
          ) : (recentOrders.data?.items ?? []).length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No orders yet"
              description="Orders will appear here as soon as customers check out."
              action={
                <Link
                  href="/"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                  )}
                >
                  View the storefront
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-secondary/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(recentOrders.data?.items ?? []).map((order) => (
                    <tr
                      key={order.id}
                      className="transition-colors hover:bg-secondary/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/orders?review=${order.id}`}
                          className="text-numeric font-medium underline-offset-4 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(order.placedAt ?? order.createdAt, true)}
                        </p>
                      </td>
                      <td className="max-w-[12rem] truncate px-4 py-3 text-muted-foreground">
                        {order.email ?? "Guest"}
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PriceDisplay
                          pence={order.grandTotalPence ?? order.totalPence}
                          size="sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="dashboard-manage">
        <h2 id="dashboard-manage" className="label-meta text-muted-foreground">
          Quick links
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Orders", href: "/admin/orders" },
            { label: "Payments", href: "/admin/payments" },
            { label: "Products", href: "/admin/products" },
            { label: "Inventory", href: "/admin/inventory" },
            { label: "Customers", href: "/admin/customers" },
            { label: "Storefront content", href: "/admin/billboard" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "justify-between bg-background shadow-none transition hover:shadow-e1",
              )}
            >
              {link.label}
              <ArrowRight aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      {dashboard.isError ? (
        <p
          className="flex items-center gap-2 text-xs text-muted-foreground"
          role="status"
        >
          <AlertTriangle className="size-3.5" aria-hidden />
          Some figures are unavailable. Latest orders still reflect the live
          queue when that section loaded.
        </p>
      ) : null}
    </div>
  );
}
