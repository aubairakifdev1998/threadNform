"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { useAdminDashboard, useErrorToast } from "@/lib/query/admin";
import { formatGbp } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  AdminDashboardShimmer,
} from "@/components/ui/page-shimmers";
import type { AdminDashboard } from "@/types/api";

const tiles = [
  {
    title: "Orders",
    description: "Fulfilment, tracking, and status transitions",
    href: "/admin/orders",
  },
  {
    title: "Payments",
    description: "Review bank-transfer proofs awaiting approval",
    href: "/admin/payments",
  },
  {
    title: "Products",
    description: "Catalogue, variants, and media",
    href: "/admin/products",
  },
  {
    title: "Inventory",
    description: "Stock levels and adjustments",
    href: "/admin/inventory",
  },
];

export function AdminDashboardPanel() {
  const dashboard = useAdminDashboard();
  useErrorToast(dashboard.error, "Failed to load dashboard");
  const stats: AdminDashboard | null = dashboard.data ?? null;

  if (dashboard.isPending) {
    return <AdminDashboardShimmer />;
  }

  const cards = [
    { label: "Orders today", value: stats?.ordersToday ?? "—" },
    {
      label: "Revenue today",
      value:
        typeof stats?.revenueTodayPence === "number"
          ? formatGbp(stats.revenueTodayPence)
          : "—",
    },
    {
      label: "Pending payments",
      value:
        stats?.pendingPaymentVerifications ??
        stats?.pendingPayments ??
        "—",
    },
    {
      label: "Low stock",
      value: stats?.lowStockVariants ?? "—",
    },
  ];

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Dashboard"
        description="Live metrics from the Thread N Form commerce API."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{card.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tiles.map((tile) => (
          <Card key={tile.href}>
            <CardHeader>
              <CardTitle className="text-lg">{tile.title}</CardTitle>
              <CardDescription>{tile.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={tile.href}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Open
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
