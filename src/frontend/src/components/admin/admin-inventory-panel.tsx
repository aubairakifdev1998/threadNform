"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { AdminSelect } from "@/components/admin/admin-select";
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
  useAdminInventory,
  useAdminMutation,
  useAllAdminProducts,
  useErrorToast,
  useProductVariants,
  useWarehouses,
} from "@/lib/query/admin";
import { cn } from "@/lib/utils";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";
import type { ProductSummary } from "@/types/api";

type Warehouse = { id: string; name: string; code?: string };
type InventoryRow = {
  id: string;
  variantId: string;
  warehouseId: string;
  onHand: number;
  available: number;
  reserved: number;
  sku?: string | null;
  productId?: string | null;
  productName?: string | null;
  productSlug?: string | null;
};
type VariantOption = {
  id: string;
  sku: string;
  status?: string;
  onHand: number;
  available: number;
};

const PAGE_SIZE = 10;
const NO_PRODUCTS: ProductSummary[] = [];

export function AdminInventoryPanel() {
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("productId") ?? "";

  const [page, setPage] = useState(1);
  const [selectedWarehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState(initialProductId);
  const [selectedVariantId, setVariantId] = useState("");
  const [onHandDelta, setOnHandDelta] = useState(10);
  const [reason, setReason] = useState("Restock");
  const [filterProductId, setFilterProductId] = useState<string>(
    initialProductId || "all",
  );

  const warehouseQuery = useWarehouses<Warehouse>();
  const inventoryQuery = useAdminInventory({
    page,
    pageSize: PAGE_SIZE,
    productId: filterProductId === "all" ? undefined : filterProductId,
  });
  const productQuery = useAllAdminProducts("DRAFT,ACTIVE,INACTIVE");
  const variantQuery = useProductVariants(productId);
  useErrorToast(
    warehouseQuery.error ?? inventoryQuery.error ?? productQuery.error,
    "Failed to load inventory",
  );
  useErrorToast(variantQuery.error, "Failed to load product variants");
  const loading =
    warehouseQuery.isPending || inventoryQuery.isPending || productQuery.isPending;

  const warehouses = warehouseQuery.data ?? [];
  // Default to the first warehouse until the admin picks one.
  const warehouseId = selectedWarehouseId || warehouses[0]?.id || "";

  // Archived products/variants and unlinked rows are excluded server-side.
  const rows: InventoryRow[] = inventoryQuery.data?.items ?? [];
  const total = inventoryQuery.data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const products: ProductSummary[] = productQuery.data ?? NO_PRODUCTS;

  const variants: VariantOption[] = useMemo(
    () =>
      productId
        ? (variantQuery.data ?? []).filter((v) => v.status !== "ARCHIVED")
        : [],
    [productId, variantQuery.data],
  );
  // Keep the chosen variant if it belongs to this product, else the first one.
  const variantId = variants.some((v) => v.id === selectedVariantId)
    ? selectedVariantId
    : (variants[0]?.id ?? "");

  const adjustMutation = useAdminMutation(
    (token, body: Parameters<typeof adminApi.adjustInventory>[1]) =>
      adminApi.adjustInventory(token, body),
  );
  const saving = adjustMutation.isPending;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!warehouseId || !variantId) {
      toast.error("Select a product variant and warehouse");
      return;
    }
    if (!Number.isFinite(onHandDelta) || onHandDelta === 0) {
      toast.error("Enter a non-zero stock change");
      return;
    }
    try {
      await adjustMutation.mutateAsync({
        warehouseId,
        variantId,
        onHandDelta,
        reason: reason.trim() || "Restock",
      });
      toast.success("Stock updated for product variant");
    } catch (error) {
      toast.error(errorMessage(error, "Adjustment failed"));
    }
  }

  const selectedVariant = variants.find((v) => v.id === variantId);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Inventory"
        description="Stock only exists for product SKUs. Adjust levels here or from each product page."
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Adjust stock</CardTitle>
          <CardDescription>
            Pick a product, then a SKU. Updates the inventory row linked to that
            variant.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="inv-warehouse">Warehouse</Label>
              <AdminSelect
                id="inv-warehouse"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="" disabled>
                  Select warehouse
                </option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-product">Product</Label>
              <AdminSelect
                id="inv-product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-variant">Variant (SKU)</Label>
              <AdminSelect
                id="inv-variant"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                disabled={!productId || variants.length === 0}
              >
                <option value="">
                  {!productId
                    ? "Choose a product first"
                    : variants.length === 0
                      ? "No active SKUs on this product"
                      : "Select SKU"}
                </option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.sku} · avail {v.available}
                  </option>
                ))}
              </AdminSelect>
              {selectedVariant ? (
                <p className="text-xs text-muted-foreground">
                  Current on hand: {selectedVariant.onHand} · available:{" "}
                  {selectedVariant.available}
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="onHandDelta">Change (+/−)</Label>
                <Input
                  id="onHandDelta"
                  type="number"
                  value={onHandDelta}
                  onChange={(e) => setOnHandDelta(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button type="submit" disabled={saving || !variantId}>
              {saving ? "Saving…" : "Update stock"}
            </Button>
            {productId ? (
              <Link
                href={`/admin/products/${productId}`}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Open product
              </Link>
            ) : null}
          </CardFooter>
        </form>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Label htmlFor="inv-filter">Filter by product</Label>
          <AdminSelect
            id="inv-filter"
            className="w-[240px]"
            value={filterProductId}
            onChange={(e) => {
              setFilterProductId(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </AdminSelect>
        </div>
      </div>

      {loading ? (
        <ListBlockShimmer />
      ) : (
        <Card
          aria-busy={inventoryQuery.isPlaceholderData}
          className={cn(
            "transition-opacity",
            inventoryQuery.isPlaceholderData && "opacity-60",
          )}
        >
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>On hand</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No product stock rows yet. Create a product with variants
                      and initial stock, or adjust stock above.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={`${row.warehouseId}-${row.variantId}`}>
                      <TableCell>
                        <p className="font-medium">
                          {row.productName ?? "Unknown product"}
                        </p>
                        {row.productSlug ? (
                          <p className="text-xs text-muted-foreground">
                            {row.productSlug}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {row.sku ?? row.variantId.slice(0, 8)}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.onHand ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            (row.available ?? 0) <= 5
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {row.available ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.productId ? (
                          <Link
                            href={`/admin/products/${row.productId}`}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "sm" }),
                            )}
                          >
                            Product
                          </Link>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (row.productId) setProductId(row.productId);
                            setVariantId(row.variantId);
                            setOnHandDelta(10);
                          }}
                        >
                          Restock
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

      {!loading && total > 0 ? (
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
