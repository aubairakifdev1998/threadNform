"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  AdminListPagination,
  paginateItems,
} from "@/components/admin/admin-list-pagination";
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
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { formatGbp } from "@/lib/money";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";

type CustomerRow = {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  status?: string;
  createdAt?: string;
};

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

export function AdminCustomersPanel() {
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const result = await adminApi.listCustomers(token, { pageSize: 100 });
      const rows = Array.isArray(result)
        ? result
        : ((result as { items?: CustomerRow[] }).items ?? []);
      setItems(rows as CustomerRow[]);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load customers",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const data = await adminApi.getCustomer(token, id);
      setDetail(data);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load customer",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleBlock(customer: CustomerRow) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    const next = customer.status === "BLOCKED" ? "ACTIVE" : "BLOCKED";
    try {
      await adminApi.setCustomerStatus(token, customer.id, next);
      toast.success(next === "BLOCKED" ? "Customer blocked" : "Customer unblocked");
      await load();
      if (selectedId === customer.id) await openDetail(customer.id);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Status update failed",
      );
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
    const token = tokenStore.getAccessToken();
    if (!token) return;
    try {
      await adminApi.deleteCustomer(token, customer.id, { deleteOrders: true });
      toast.success("Customer and related history deleted");
      setSelectedId(null);
      setDetail(null);
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Delete failed",
      );
    }
  }

  const paged = paginateItems(items, page, 10);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Customers"
        description="Block accounts or permanently purge profile, orders, and payment history."
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {loading ? (
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
                    paged.items.map((c) => (
                      <TableRow
                        key={c.id}
                        data-state={selectedId === c.id ? "selected" : undefined}
                      >
                        <TableCell>
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => void openDetail(c.id)}
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
                            onClick={() => void openDetail(c.id)}
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

      {!loading && items.length > 0 ? (
        <AdminListPagination
          page={paged.page}
          totalPages={paged.totalPages}
          total={paged.total}
          pageSize={10}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
