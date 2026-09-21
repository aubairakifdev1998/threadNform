"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { adminApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
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
  const [stats, setStats] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = tokenStore.getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    adminApi
      .dashboard(token)
      .then(setStats)
      .catch((error) => {
        toast.error(
          error instanceof ApiError ? error.message : "Failed to load dashboard",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
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
