"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminApi } from "@/lib/api";
import {
  errorMessage,
  useAdminCustomer,
  useAdminCustomers,
  useAdminMutation,
  useErrorToast,
  type CustomerRow,
} from "@/lib/query/admin";
import { formatGbp } from "@/lib/money";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";

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

  const customers = useAdminCustomers({ page, pageSize: PAGE_SIZE });
  useErrorToast(customers.error, "Failed to load customers");
  const items: CustomerRow[] = customers.data?.items ?? [];
  const total = customers.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const customerDetail = useAdminCustomer(selectedId);
  useErrorToast(customerDetail.error, "Failed to load customer");
  const detail: CustomerDetail | null = customerDetail.data ?? null;
  const detailLoading = customerDetail.isFetching && !customerDetail.data;

  const statusMutation = useAdminMutation(
    (token, vars: { id: string; status: "ACTIVE" | "BLOCKED" }) =>
      adminApi.setCustomerStatus(token, vars.id, vars.status),
  );
  const deleteMutation = useAdminMutation((token, id: string) =>
    adminApi.deleteCustomer(token, id, { deleteOrders: true }),
  );

  function openDetail(id: string) {
    setSelectedId(id);
  }

  async function toggleBlock(customer: CustomerRow) {
    const next = customer.status === "BLOCKED" ? "ACTIVE" : "BLOCKED";
    try {
      await statusMutation.mutateAsync({ id: customer.id, status: next });
      toast.success(next === "BLOCKED" ? "Customer blocked" : "Customer unblocked");
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


  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Customers"
        description="Block accounts or permanently purge profile, orders, and payment history."
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {customers.isPending ? (
          <ListBlockShimmer />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No customers yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((c) => (
                      <TableRow
                        key={c.id}
                        data-state={selectedId === c.id ? "selected" : undefined}
                      >
                        <TableCell>
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => openDetail(c.id)}
                          >
                            <p className="font-medium">
                              {c.fullName ?? "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {c.email}
                            </p>
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              c.status === "BLOCKED" ? "destructive" : "secondary"
                            }
                          >
                            {c.status ?? "ACTIVE"}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-1 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openDetail(c.id)}
                          >
                            View
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void toggleBlock(c)}
                          >
                            {c.status === "BLOCKED" ? "Unblock" : "Block"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => void purge(c)}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Customer detail</CardTitle>
            <CardDescription>
              Orders and payment history linked to this account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedId ? (
              <p className="text-sm text-muted-foreground">
                Select a customer to inspect orders.
              </p>
            ) : detailLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : detail ? (
              <>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{detail.fullName ?? "—"}</p>
                  <p>{detail.email}</p>
                  <p className="text-muted-foreground">
                    {detail.phone ?? "No phone"} · {detail.status ?? "ACTIVE"}
                  </p>
                  <p className="text-muted-foreground">
                    {detail.orderCount ?? 0} order(s)
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.orders ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground"
                        >
                          No orders
                        </TableCell>
                      </TableRow>
                    ) : (
                      (detail.orders ?? []).map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">
                            {o.orderNumber}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{o.status}</Badge>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {typeof o.grandTotalPence === "number"
                              ? formatGbp(o.grandTotalPence)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {!customers.isPending && total > 0 ? (
        <AdminListPagination
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
