"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Boxes, ExternalLink, PackagePlus, SlidersHorizontal } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import { DataTable } from "@/components/admin/data-table";
import { RowActions } from "@/components/admin/row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AdminSelect } from "@/components/admin/admin-select";
import { MetaChip } from "@/components/ui/status-badge";
import { StockBadge } from "@/components/status/status-badges";
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
import { LOW_STOCK_THRESHOLD } from "@/lib/status";
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
  const [filterProductId, setFilterProductId] = useState<string>(
    initialProductId || "all",
  );
  const [adjustOpen, setAdjustOpen] = useState(false);
  // Pre-selection carried into the sheet when adjusting from a specific row.
  const [adjustTarget, setAdjustTarget] = useState<{
    productId: string;
    variantId: string;
  } | null>(initialProductId ? { productId: initialProductId, variantId: "" } : null);

  const inventoryQuery = useAdminInventory({
    page,
    pageSize: PAGE_SIZE,
    productId: filterProductId === "all" ? undefined : filterProductId,
  });
  const productQuery = useAllAdminProducts("DRAFT,ACTIVE,INACTIVE");
  useErrorToast(productQuery.error, "Failed to load the product list");

  // Archived products/variants and unlinked rows are excluded server-side.
  const rows: InventoryRow[] = inventoryQuery.data?.items ?? [];
  const total = inventoryQuery.data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const products: ProductSummary[] = productQuery.data ?? NO_PRODUCTS;

  const lowStockCount = rows.filter(
    (row) => (row.available ?? 0) <= LOW_STOCK_THRESHOLD,
  ).length;

  function openAdjust(target?: { productId: string; variantId: string }) {
    setAdjustTarget(target ?? null);
    setAdjustOpen(true);
  }

  const columns = useMemo<ColumnDef<InventoryRow, unknown>[]>(
    () => [
      {
        accessorKey: "productName",
        header: "Product",
        meta: { primary: true, label: "Product" },
        cell: ({ row }) => (
          <div className="min-w-0">
            {row.original.productId ? (
              <Link
                href={`/admin/products/${row.original.productId}`}
                className="font-medium hover:underline"
              >
                {row.original.productName ?? "Unknown product"}
              </Link>
            ) : (
              <span className="font-medium">
                {row.original.productName ?? "Unknown product"}
              </span>
            )}
            {row.original.productSlug ? (
              <p className="truncate text-xs text-muted-foreground">
                {row.original.productSlug}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) => (
          <MetaChip className="text-numeric">
            {row.original.sku ?? row.original.variantId.slice(0, 8)}
          </MetaChip>
        ),
      },
      {
        accessorKey: "onHand",
        header: "On hand",
        meta: { align: "right", secondary: true },
        cell: ({ row }) => row.original.onHand ?? "—",
      },
      {
        accessorKey: "reserved",
        header: "Reserved",
        meta: { align: "right", secondary: true },
        cell: ({ row }) => row.original.reserved ?? "—",
      },
      {
        accessorKey: "available",
        header: "Available",
        cell: ({ row }) => <StockBadge available={row.original.available} />,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { align: "right", cardFooter: true, className: "w-12" },
        cell: ({ row }) => (
          <RowActions
            label={row.original.sku ?? "this SKU"}
            actions={[
              {
                label: "Adjust stock",
                icon: <SlidersHorizontal aria-hidden />,
                onSelect: () =>
                  openAdjust({
                    productId: row.original.productId ?? "",
                    variantId: row.original.variantId,
                  }),
              },
              ...(row.original.productId
                ? [
                    {
                      label: "Open product",
                      icon: <ExternalLink aria-hidden />,
                      href: `/admin/products/${row.original.productId}`,
                    },
                  ]
                : []),
            ]}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Inventory"
        description="Stock is held per product SKU. Adjust levels here or from a product page."
        actions={
          <Button type="button" onClick={() => openAdjust()}>
            <PackagePlus aria-hidden />
            Adjust stock
          </Button>
        }
      />

      {lowStockCount > 0 ? (
        <p
          className="rounded-lg border border-foreground/25 bg-foreground/5 px-3 py-2 text-sm"
          role="status"
        >
          {lowStockCount} SKU{lowStockCount === 1 ? "" : "s"} on this page{" "}
          {lowStockCount === 1 ? "is" : "are"} at or below{" "}
          {LOW_STOCK_THRESHOLD} units.
        </p>
      ) : null}

      <DataTable
        caption="Stock levels"
        columns={columns}
        data={rows}
        getRowId={(row) => `${row.warehouseId}-${row.variantId}`}
        isLoading={inventoryQuery.isPending}
        isRefreshing={inventoryQuery.isPlaceholderData}
        isError={inventoryQuery.isError}
        error={inventoryQuery.error}
        onRetry={() => void inventoryQuery.refetch()}
        toolbar={
          <div className="flex items-center gap-2">
            <Label htmlFor="inv-filter" className="label-meta text-muted-foreground">
              Product
            </Label>
            <AdminSelect
              id="inv-filter"
              className="w-full sm:w-56"
              value={filterProductId}
              onChange={(event) => {
                setFilterProductId(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </AdminSelect>
          </div>
        }
        empty={{
          icon: Boxes,
          title:
            filterProductId === "all"
              ? "No stock records yet"
              : "No stock records for this product",
          description:
            filterProductId === "all"
              ? "Stock rows are created when a product variant is given an opening quantity."
              : "This product has no stocked SKUs. Adjust stock to create the first record.",
          action: (
            <Button size="sm" onClick={() => openAdjust()}>
              <PackagePlus aria-hidden />
              Adjust stock
            </Button>
          ),
        }}
        footer={
          !inventoryQuery.isPending && !inventoryQuery.isError && total > 0 ? (
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

      <AdjustStockSheet
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        products={products}
        target={adjustTarget}
      />
    </div>
  );
}

function AdjustStockSheet({
  open,
  onOpenChange,
  products,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductSummary[];
  target: { productId: string; variantId: string } | null;
}) {
  const [productId, setProductId] = useState(target?.productId ?? "");
  const [selectedVariantId, setVariantId] = useState(target?.variantId ?? "");
  const [selectedWarehouseId, setWarehouseId] = useState("");
  const [onHandDelta, setOnHandDelta] = useState(10);
  const [reason, setReason] = useState("Restock");

  // Re-seed from the row the admin opened the sheet from.
  useEffect(() => {
    if (!open) return;
    setProductId(target?.productId ?? "");
    setVariantId(target?.variantId ?? "");
  }, [open, target]);

  const warehouseQuery = useWarehouses<Warehouse>();
  const variantQuery = useProductVariants(productId);
  useErrorToast(warehouseQuery.error, "Failed to load warehouses");
  useErrorToast(variantQuery.error, "Failed to load product variants");

  const warehouses = warehouseQuery.data ?? [];
  // Default to the first warehouse until the admin picks one.
  const warehouseId = selectedWarehouseId || warehouses[0]?.id || "";

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
  const selectedVariant = variants.find((v) => v.id === variantId);

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
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Adjustment failed"));
    }
  }

  const projected = selectedVariant
    ? selectedVariant.onHand + (Number.isFinite(onHandDelta) ? onHandDelta : 0)
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Adjust stock</SheetTitle>
          <SheetDescription>
            Pick a product, then a SKU. This updates the inventory row linked to
            that variant.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-4 px-4">
            <div className="space-y-2">
              <Label htmlFor="inv-warehouse">Warehouse</Label>
              <AdminSelect
                id="inv-warehouse"
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
              >
                <option value="" disabled>
                  Select warehouse
                </option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </AdminSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inv-product">Product</Label>
              <AdminSelect
                id="inv-product"
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
              >
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </AdminSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inv-variant">Variant (SKU)</Label>
              <AdminSelect
                id="inv-variant"
                value={variantId}
                onChange={(event) => setVariantId(event.target.value)}
                disabled={!productId || variants.length === 0}
              >
                <option value="">
                  {!productId
                    ? "Choose a product first"
                    : variants.length === 0
                      ? "No active SKUs on this product"
                      : "Select SKU"}
                </option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.sku} · avail {variant.available}
                  </option>
                ))}
              </AdminSelect>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="onHandDelta">Change (+/−)</Label>
                <Input
                  id="onHandDelta"
                  type="number"
                  inputMode="numeric"
                  value={onHandDelta}
                  onChange={(event) =>
                    setOnHandDelta(Number(event.target.value))
                  }
                  className="text-numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            </div>

            {selectedVariant ? (
              <div
                className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm"
                role="status"
                aria-live="polite"
              >
                <p className="text-muted-foreground">
                  On hand{" "}
                  <span className="text-numeric font-medium text-foreground">
                    {selectedVariant.onHand}
                  </span>{" "}
                  · available{" "}
                  <span className="text-numeric font-medium text-foreground">
                    {selectedVariant.available}
                  </span>
                </p>
                {projected != null ? (
                  <p className="mt-1">
                    After this change, on hand will be{" "}
                    <span className="text-numeric font-medium">{projected}</span>
                    {projected < 0 ? " — which is not allowed" : ""}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <SheetFooter className="flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !variantId}>
              {saving ? "Saving…" : "Update stock"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
