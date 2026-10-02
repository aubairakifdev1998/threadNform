"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
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
import {
  errorMessage,
  useAdminMutation,
  useAdminProducts,
  useErrorToast,
} from "@/lib/query/admin";
import { formatGbp } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AdminTableShimmer } from "@/components/ui/page-shimmers";
import type { ProductSummary } from "@/types/api";

const PAGE_SIZE = 10;
/** Everything except ARCHIVED, filtered server-side so pages stay full. */
const LIVE_STATUSES = "DRAFT,ACTIVE,INACTIVE";

export function AdminProductsPanel() {
  const [page, setPage] = useState(1);

  const products = useAdminProducts({
    page,
    pageSize: PAGE_SIZE,
    status: LIVE_STATUSES,
  });
  useErrorToast(products.error, "Failed to load products");
  const items: ProductSummary[] = products.isError
    ? []
    : (products.data?.items ?? []);
  const total = products.isError ? 0 : (products.data?.total ?? items.length);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activateMutation = useAdminMutation((token, id: string) =>
    adminApi.updateProduct(token, id, { status: "ACTIVE" }),
  );
  const archiveMutation = useAdminMutation((token, id: string) =>
    adminApi.deleteProduct(token, id),
  );

  async function activate(id: string) {
    try {
      await activateMutation.mutateAsync(id);
      toast.success("Product activated");
    } catch (error) {
      toast.error(errorMessage(error, "Could not activate"));
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Archive “${name}”? It will leave the storefront.`)) {
      return;
    }
    try {
      const result = await archiveMutation.mutateAsync(id);
      toast.success(
        result.stockRowsRemoved > 0
          ? `Product archived · ${result.stockRowsRemoved} stock row(s) removed`
          : "Product archived",
      );
      // Archiving the last row on a page: step back so the page isn't empty.
      if (items.length === 1 && page > 1) setPage(page - 1);
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete"));
    }
  }


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

      {products.isPending ? (
        <AdminTableShimmer />
      ) : (
        <Card
          aria-busy={products.isPlaceholderData}
          className={cn(
            "transition-opacity",
            products.isPlaceholderData && "opacity-60",
          )}
        >
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
                  items.map((product) => {
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
      {!products.isPending && total > 0 ? (
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
