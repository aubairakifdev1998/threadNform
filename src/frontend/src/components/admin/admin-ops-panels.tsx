"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ScrollText, Truck, Warehouse } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DataTable } from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetaChip, StatusBadge } from "@/components/ui/status-badge";
import { PriceDisplay } from "@/components/ui/price";
import { ErrorState } from "@/components/ui/data-states";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi, catalogApi } from "@/lib/api";
import { tokenStore } from "@/lib/auth/session";
import { useAdminDashboard, useWarehouses } from "@/lib/query/admin";

type WarehouseRow = {
  id: string;
  code?: string;
  name: string;
  isDefault?: boolean;
};

export function AdminWarehousesPanel() {
  const query = useWarehouses<WarehouseRow>();
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<WarehouseRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { primary: true, label: "Name" },
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) =>
          row.original.code ? (
            <MetaChip className="text-numeric">{row.original.code}</MetaChip>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "isDefault",
        header: "Role",
        cell: ({ row }) =>
          row.original.isDefault ? (
            <StatusBadge tone="info">Default location</StatusBadge>
          ) : (
            <span className="text-sm text-muted-foreground">Secondary</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Warehouses"
        description="Fulfilment locations used for stock and checkout reservation."
      />
      <DataTable
        caption="Warehouses"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          icon: Warehouse,
          title: "No warehouses configured",
          description:
            "At least one location is needed before stock can be held or orders reserved. Run the database seed to create the default warehouse.",
        }}
      />
    </div>
  );
}

type ShippingRow = {
  id: string;
  name: string;
  description?: string | null;
  pricePence: number;
  etaMinDays?: number;
  etaMaxDays?: number;
};

export function AdminShippingPanel() {
  const query = useQuery({
    queryKey: ["admin", "shipping-methods"],
    queryFn: () => catalogApi.listShippingMethods(),
  });
  const methods = (query.data ?? []) as ShippingRow[];

  const columns = useMemo<ColumnDef<ShippingRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Method",
        meta: { primary: true, label: "Method" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            {row.original.description ? (
              <p className="text-xs text-muted-foreground">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "eta",
        header: "Delivery estimate",
        cell: ({ row }) =>
          row.original.etaMinDays != null ? (
            <span className="text-numeric text-sm">
              {row.original.etaMinDays}–{row.original.etaMaxDays} working days
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Not stated</span>
          ),
      },
      {
        accessorKey: "pricePence",
        header: "Price",
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.pricePence === 0 ? (
            <StatusBadge tone="success">Free</StatusBadge>
          ) : (
            <PriceDisplay pence={row.original.pricePence} size="sm" />
          ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Shipping"
        description="Delivery methods offered to customers at checkout."
      />
      <DataTable
        caption="Shipping methods"
        columns={columns}
        data={methods}
        getRowId={(row) => row.id}
        isLoading={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          icon: Truck,
          title: "No shipping methods available",
          description:
            "Customers cannot complete checkout without at least one delivery method. Add one via the API or database seed.",
        }}
      />
    </div>
  );
}

/** Metrics worth naming; anything else the API adds is listed after these. */
const REPORT_METRICS: Array<{
  keys: string[];
  label: string;
  format: "number" | "money";
  hint: string;
  href?: string;
}> = [
  {
    keys: ["ordersToday"],
    label: "Orders today",
    format: "number",
    hint: "Orders placed since midnight",
    href: "/admin/orders",
  },
  {
    keys: ["revenueTodayPence"],
    label: "Revenue today",
    format: "money",
    hint: "Confirmed order value since midnight",
    href: "/admin/orders",
  },
  {
    keys: ["pendingPaymentVerifications", "pendingPayments"],
    label: "Payments to review",
    format: "number",
    hint: "Bank transfers awaiting a decision",
    href: "/admin/orders?queue=review",
  },
  {
    keys: ["processingOrders"],
    label: "Orders in progress",
    format: "number",
    hint: "Paid and not yet shipped",
    href: "/admin/orders?queue=fulfil",
  },
  {
    keys: ["lowStockVariants"],
    label: "Low stock SKUs",
    format: "number",
    hint: "At or below the restock threshold",
    href: "/admin/inventory",
  },
];

export function AdminReportsPanel() {
  const query = useAdminDashboard();
  const stats = (query.data ?? {}) as Record<string, unknown>;

  const named = REPORT_METRICS.map((metric) => {
    const key = metric.keys.find((k) => typeof stats[k] === "number");
    return { ...metric, value: key ? (stats[key] as number) : null };
  });

  const covered = new Set(REPORT_METRICS.flatMap((metric) => metric.keys));
  const extra = Object.entries(stats).filter(
    ([key, value]) =>
      !covered.has(key) &&
      (typeof value === "number" ||
        typeof value === "string" ||
        typeof value === "boolean"),
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reports"
        description="Snapshot metrics from the admin dashboard API."
      />

      {query.isPending ? (
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-label="Loading reports"
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="space-y-3 rounded-lg border border-border p-4"
            >
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <div className="rounded-lg border border-border bg-card">
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {named.map((metric) => {
              const body = (
                <CardContent className="space-y-1 pt-5">
                  <p className="label-meta text-muted-foreground">
                    {metric.label}
                  </p>
                  {metric.format === "money" ? (
                    <PriceDisplay
                      pence={metric.value}
                      size="lg"
                      className="text-3xl font-semibold tracking-tight"
                    />
                  ) : (
                    <p className="text-numeric text-3xl font-semibold tracking-tight">
                      {metric.value == null
                        ? "—"
                        : metric.value.toLocaleString("en-GB")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{metric.hint}</p>
                </CardContent>
              );
              return (
                <Card key={metric.label} className="transition-colors hover:bg-secondary/40">
                  {metric.href ? (
                    <Link href={metric.href} className="block">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </Card>
              );
            })}
          </div>

          {extra.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Other metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {extra.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-baseline justify-between gap-4 border-b border-border pb-2"
                    >
                      <dt className="text-sm text-muted-foreground">
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (c) => c.toUpperCase())}
                      </dt>
                      <dd className="text-numeric text-sm font-medium">
                        {String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

type AuditRow = {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
};

export function AdminAuditLogsPanel() {
  const [q, setQ] = useState("");
  const token = tokenStore.getAccessToken();
  const query = useQuery({
    queryKey: ["admin", "audit-logs", q],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) throw new Error("Not signed in");
      return adminApi.listAuditLogs(token, { page: 1, pageSize: 50, q: q || undefined });
    },
  });
  const rows = query.data?.items ?? [];

  const columns = useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        cell: ({ row }) => (
          <span className="text-numeric text-sm text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString("en-GB")}
          </span>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        meta: { primary: true, label: "Action" },
        cell: ({ row }) => (
          <span className="font-medium">{row.original.action}</span>
        ),
      },
      {
        accessorKey: "entityType",
        header: "Entity",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.entityType}
            {row.original.entityId ? (
              <span className="ml-1 text-muted-foreground">
                · {row.original.entityId.slice(0, 8)}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "actorType",
        header: "Actor",
        cell: ({ row }) => (
          <StatusBadge
            tone={row.original.actorType === "ADMIN" ? "info" : "neutral"}
          >
            {row.original.actorType}
          </StatusBadge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Audit logs"
        description="Recent product and order changes recorded by the API."
      />
      <DataTable
        caption="Audit logs"
        columns={columns}
        data={rows}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Search action or entity…"
        empty={{
          icon: ScrollText,
          title: "No audit events yet",
          description: "Admin catalogue and order actions will appear here.",
        }}
      />
    </div>
  );
}
