"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { adminApi, catalogApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { formatGbp } from "@/lib/money";

export function AdminWarehousesPanel() {
  const [rows, setRows] = useState<
    Array<{ id: string; code?: string; name: string; isDefault?: boolean }>
  >([]);

  useEffect(() => {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    adminApi
      .listWarehouses(token)
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        toast.error(
          error instanceof ApiError ? error.message : "Failed to load warehouses",
        );
      });
  }, []);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Warehouses"
        description="Fulfilment locations used for stock and checkout reservation."
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Default</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No warehouses found. Run database migrations/seed.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell>{w.code ?? "—"}</TableCell>
                    <TableCell>
                      {w.isDefault ? <Badge>Default</Badge> : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminShippingPanel() {
  const [methods, setMethods] = useState<
    Array<{
      id: string;
      name: string;
      description?: string | null;
      pricePence: number;
      etaMinDays?: number;
      etaMaxDays?: number;
    }>
  >([]);

  useEffect(() => {
    catalogApi
      .listShippingMethods()
      .then(setMethods)
      .catch((error) => {
        toast.error(
          error instanceof ApiError
            ? error.message
            : "Failed to load shipping methods",
        );
      });
  }, []);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Shipping"
        description="Delivery methods available at checkout."
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {methods.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    {m.etaMinDays != null
                      ? `${m.etaMinDays}–${m.etaMaxDays} days`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatGbp(m.pricePence)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminReportsPanel() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    adminApi
      .dashboard(token)
      .then((data) => setStats(data as Record<string, unknown>))
      .catch((error) => {
        toast.error(
          error instanceof ApiError ? error.message : "Failed to load reports",
        );
      });
  }, []);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reports"
        description="Snapshot metrics from the admin dashboard API."
      />
      <Card>
        <CardHeader>
          <CardTitle>Dashboard JSON</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
            {stats ? JSON.stringify(stats, null, 2) : "Loading…"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminAuditLogsPanel() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Audit logs"
        description="Product and order changes are written to audit_logs by the API."
      />
      <Alert>
        <AlertTitle>Inspect in Supabase</AlertTitle>
        <AlertDescription>
          Use Table Editor → <code>audit_logs</code> to review recent admin
          actions. A dedicated list endpoint can be added next.
        </AlertDescription>
      </Alert>
    </div>
  );
}
