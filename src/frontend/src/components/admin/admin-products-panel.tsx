"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  AdminListPagination,
  paginateItems,
} from "@/components/admin/admin-list-pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { AdminTableShimmer } from "@/components/ui/page-shimmers";
import type { ProductSummary } from "@/types/api";

export function AdminProductsPanel() {
  const [items, setItems] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function load() {
    const token = tokenStore.getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await adminApi.listProducts(token, { pageSize: 50 });
      setItems(
        (result?.items ?? []).filter(
          (p) => (p as { status?: string }).status !== "ARCHIVED",
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load products",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function activate(id: string) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    try {
      await adminApi.updateProduct(token, id, { status: "ACTIVE" });
      toast.success("Product activated");
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not activate",
      );
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Archive “${name}”? It will leave the storefront.`)) {
      return;
    }
    const token = tokenStore.getAccessToken();
    if (!token) return;
    try {
      const result = await adminApi.deleteProduct(token, id);
      toast.success(
        result.stockRowsRemoved > 0
          ? `Product archived · ${result.stockRowsRemoved} stock row(s) removed`
          : "Product archived",
      );
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not delete",
      );
    }
  }

  const paged = paginateItems(items, page, 10);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Products"
        description="Create, edit, stock, and archive catalogue products."
        actions={
          <Link href="/admin/products/new" className={cn(buttonVariants())}>
            New product
          </Link>
        }
      />

      {loading ? (
        <AdminTableShimmer />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No products yet. Create one or run the catalogue seed.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.items.map((product) => {
                    const status =
                      (product as { status?: string }).status ?? "—";
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="font-medium hover:underline"
                          >
                            {product.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {product.slug}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {product.productType}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {typeof product.basePricePence === "number"
                            ? formatGbp(product.basePricePence)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              status === "ACTIVE" ? "default" : "outline"
                            }
                          >
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-1 text-right">
                          <Link
                            href={`/admin/products/${product.id}`}
                            className={cn(
                              buttonVariants({
                                variant: "outline",
                                size: "sm",
                              }),
                            )}
                          >
                            View
                          </Link>
                          {status !== "ACTIVE" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => void activate(product.id)}
                            >
                              Activate
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void remove(product.id, product.name)}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
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
