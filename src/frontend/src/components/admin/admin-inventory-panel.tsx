"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  AdminListPagination,
  paginateItems,
} from "@/components/admin/admin-list-pagination";
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
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";
import type { ProductSummary } from "@/types/api";

type Warehouse = { id: string; name: string; code?: string };
type InventoryRow = {
  id?: string;
  variantId: string;
  warehouseId: string;
  onHand?: number;
  available?: number;
  reserved?: number;
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

export function AdminInventoryPanel() {
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("productId") ?? "";

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState(initialProductId);
  const [variantId, setVariantId] = useState("");
  const [onHandDelta, setOnHandDelta] = useState(10);
  const [reason, setReason] = useState("Restock");
  const [saving, setSaving] = useState(false);
  const [filterProductId, setFilterProductId] = useState<string>(
    initialProductId || "all",
  );

  async function load() {
    const token = tokenStore.getAccessToken();
    if (!token) {
      setLoading(false);
      toast.error("Sign in required");
      return;
    }
    setLoading(true);
    try {
      const [wh, inv, productList] = await Promise.all([
        adminApi.listWarehouses(token),
        adminApi.listInventory(token, { pageSize: 200 }),
        adminApi.listProducts(token, { pageSize: 100 }),
      ]);
      const warehouseList = Array.isArray(wh)
        ? wh
        : ((wh as { items?: Warehouse[] }).items ?? []);
      setWarehouses(warehouseList as Warehouse[]);
      if (!warehouseId && warehouseList[0]) {
        setWarehouseId((warehouseList[0] as Warehouse).id);
      }

      // Inventory is product→variant scoped; drop any row without a product link.
      const linkedRows = (inv.items ?? []).filter(
        (row): row is InventoryRow & { productId: string } =>
          Boolean(row.productId),
      );
      setRows(linkedRows);

      const liveProducts = (productList.items ?? []).filter(
        (p) => (p as { status?: string }).status !== "ARCHIVED",
      );
      setProducts(liveProducts);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load inventory",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadVariants() {
      const token = tokenStore.getAccessToken();
      if (!token || !productId) {
        setVariants([]);
        setVariantId("");
        return;
      }
      try {
        const list = await adminApi.listProductVariants(token, productId);
        if (cancelled) return;
        const active = list.filter((v) => v.status !== "ARCHIVED");
        setVariants(active);
        setVariantId((current) =>
          active.some((v) => v.id === current) ? current : (active[0]?.id ?? ""),
        );
      } catch (error) {
        if (!cancelled) {
          setVariants([]);
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Failed to load product variants",
          );
        }
      }
    }
    void loadVariants();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const token = tokenStore.getAccessToken();
    if (!token || !warehouseId || !variantId) {
      toast.error("Select a product variant and warehouse");
      return;
    }
    if (!Number.isFinite(onHandDelta) || onHandDelta === 0) {
      toast.error("Enter a non-zero stock change");
      return;
    }
    setSaving(true);
    try {
      await adminApi.adjustInventory(token, {
        warehouseId,
        variantId,
        onHandDelta,
        reason: reason.trim() || "Restock",
      });
      toast.success("Stock updated for product variant");
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Adjustment failed",
      );
    } finally {
      setSaving(false);
    }
  }

  const productsWithStock = useMemo(() => {
    const ids = new Set(rows.map((r) => r.productId).filter(Boolean));
    return products.filter((p) => ids.has(p.id));
  }, [products, rows]);

  const filteredRows = useMemo(() => {
    if (filterProductId === "all") return rows;
    return rows.filter((row) => row.productId === filterProductId);
  }, [rows, filterProductId]);

  const paged = paginateItems(filteredRows, page, 10);
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
            <option value="all">All products with stock</option>
            {productsWithStock.map((p) => (
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
        <Card>
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
                {paged.items.length === 0 ? (
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
                  paged.items.map((row) => (
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

      {!loading && filteredRows.length > 0 ? (
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
