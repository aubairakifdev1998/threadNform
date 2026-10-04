"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Eye, ShieldCheck, Trash2, Users } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import { DataTable } from "@/components/admin/data-table";
import { RowActions } from "@/components/admin/row-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PriceDisplay } from "@/components/ui/price";
import {
  CustomerStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/status/status-badges";
import { EmptyState, ErrorState } from "@/components/ui/data-states";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";
import {
  errorMessage,
  useAdminCustomer,
  useAdminCustomers,
  useAdminMutation,
  type CustomerRow,
} from "@/lib/query/admin";

type CustomerDetail = CustomerRow & {
  orderCount?: number;
  orders?: Array<{
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus?: string;
    grandTotalPence?: number;
  }>;
};

const PAGE_SIZE = 10;

export function AdminCustomersPanel() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim());

  useEffect(() => {
    setPage(1);
  }, [query]);

  const customers = useAdminCustomers({
    page,
    pageSize: PAGE_SIZE,
    q: query || undefined,
  });
  const items: CustomerRow[] = customers.data?.items ?? [];
  const total = customers.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusMutation = useAdminMutation(
    (token, vars: { id: string; status: "ACTIVE" | "BLOCKED" }) =>
      adminApi.setCustomerStatus(token, vars.id, vars.status),
  );
  const deleteMutation = useAdminMutation((token, id: string) =>
    adminApi.deleteCustomer(token, id, { deleteOrders: true }),
  );

  async function toggleBlock(customer: CustomerRow) {
    const next = customer.status === "BLOCKED" ? "ACTIVE" : "BLOCKED";
    try {
      await statusMutation.mutateAsync({ id: customer.id, status: next });
      toast.success(
        next === "BLOCKED" ? "Customer blocked" : "Customer unblocked",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Status update failed"));
    }
  }

  async function purge(customer: CustomerRow) {
    if (
      !window.confirm(
        `Permanently delete ${customer.email}?\n\nThis removes the auth account, profile, carts, and all related orders/payments.`,
      )
    ) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(customer.id);
      toast.success("Customer and related history deleted");
      if (selectedId === customer.id) setSelectedId(null);
      if (items.length === 1 && page > 1) setPage(page - 1);
    } catch (error) {
      toast.error(errorMessage(error, "Delete failed"));
    }
  }

  const columns = useMemo<ColumnDef<CustomerRow, unknown>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Customer",
        meta: { primary: true, label: "Customer" },
        cell: ({ row }) => (
          <button
            type="button"
            className={cn(
              "min-w-0 max-w-full rounded-md px-1.5 py-1 text-left",
              selectedId === row.original.id && "bg-secondary",
            )}
            aria-pressed={selectedId === row.original.id}
            onClick={() => setSelectedId(row.original.id)}
          >
            <span className="block truncate font-medium">
              {row.original.fullName ?? "No name given"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.original.email}
            </span>
          </button>
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        meta: { secondary: true },
        cell: ({ row }) => (
          <span className="text-numeric text-sm text-muted-foreground">
            {row.original.phone ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <CustomerStatusBadge status={row.original.status ?? "ACTIVE"} />
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { align: "right", cardFooter: true, className: "w-12" },
        cell: ({ row }) => {
          const customer = row.original;
          const blocked = customer.status === "BLOCKED";
          return (
            <RowActions
              label={customer.email}
              actions={[
                {
                  label: "View orders",
                  icon: <Eye aria-hidden />,
                  onSelect: () => setSelectedId(customer.id),
                },
                {
                  label: blocked ? "Unblock account" : "Block account",
                  icon: blocked ? (
                    <ShieldCheck aria-hidden />
                  ) : (
                    <Ban aria-hidden />
                  ),
                  onSelect: () => void toggleBlock(customer),
                },
                {
                  label: "Delete permanently",
                  icon: <Trash2 aria-hidden />,
                  destructive: true,
                  separated: true,
                  onSelect: () => void purge(customer),
                },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, page, items.length],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Customers"
        description="Block accounts or permanently purge profile, orders, and payment history."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <DataTable
          caption="Customers"
          columns={columns}
          data={items}
          getRowId={(row) => row.id}
          isLoading={customers.isPending}
          isRefreshing={customers.isPlaceholderData}
          isError={customers.isError}
          error={customers.error}
          onRetry={() => void customers.refetch()}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by name or email"
          empty={{
            icon: Users,
            title: query
              ? `No customers match “${query}”`
              : "No customers yet",
            description: query
              ? "Check the spelling, or clear the search to see every account."
              : "Accounts appear here once shoppers register or place their first order.",
            action: query ? (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : undefined,
          }}
          footer={
            !customers.isPending && !customers.isError && total > 0 ? (
              <AdminListPagination
                page={Math.min(page, totalPages)}
                totalPages={totalPages}
                total={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            ) : null
          }
        />

        <CustomerDetailCard
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>
  );
}

function CustomerDetailCard({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const detailQuery = useAdminCustomer(customerId);
  const detail: CustomerDetail | null = detailQuery.data ?? null;
  const orders = detail?.orders ?? [];

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle>Customer detail</CardTitle>
        <CardDescription>
          Orders and payment history linked to this account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!customerId ? (
          <EmptyState
            icon={Eye}
            title="No customer selected"
            description="Choose a customer from the list to see their orders and payment history."
            className="py-10"
          />
        ) : detailQuery.isPending ? (
          <div className="space-y-3" role="status" aria-label="Loading customer">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-52" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : detailQuery.isError ? (
          <ErrorState
            error={detailQuery.error}
            onRetry={() => void detailQuery.refetch()}
            className="py-10"
          />
        ) : detail ? (
          <>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">
                  {detail.fullName ?? "No name given"}
                </p>
                <CustomerStatusBadge status={detail.status ?? "ACTIVE"} />
              </div>
              <p className="text-sm break-all">{detail.email}</p>
              <p className="text-numeric text-sm text-muted-foreground">
                {detail.phone ?? "No phone"}
              </p>
              <p className="text-sm text-muted-foreground">
                {detail.orderCount ?? orders.length} order
                {(detail.orderCount ?? orders.length) === 1 ? "" : "s"}
              </p>
            </div>

            <div className="space-y-2">
              <p className="label-meta text-muted-foreground">Orders</p>
              {orders.length === 0 ? (
                <p className="rounded-lg border border-border bg-secondary/40 px-3 py-4 text-sm text-muted-foreground">
                  This customer hasn&apos;t placed an order yet.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {orders.map((order) => (
                    <li key={order.id} className="space-y-2 px-3 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link
                          href={`/admin/orders?review=${order.id}`}
                          className="text-numeric text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <PriceDisplay
                          pence={order.grandTotalPence}
                          size="sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <OrderStatusBadge status={order.status} />
                        {order.paymentStatus ? (
                          <PaymentStatusBadge status={order.paymentStatus} />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
