"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, CheckCircle2, Package, Pencil, Plus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import { DataTable } from "@/components/admin/data-table";
import { RowActions } from "@/components/admin/row-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { MetaChip } from "@/components/ui/status-badge";
import { ProductStatusBadge } from "@/components/status/status-badges";
import { PriceDisplay } from "@/components/ui/price";
import { ToggleFilter } from "@/components/admin/toggle-filter";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminApi } from "@/lib/api";
import {
  errorMessage,
  useAdminMutation,
  useAdminProducts,
} from "@/lib/query/admin";
import { cn } from "@/lib/utils";
import type { ProductSummary } from "@/types/api";

const PAGE_SIZE = 10;
/** Everything except ARCHIVED, filtered server-side so pages stay full. */
const LIVE_STATUSES = "DRAFT,ACTIVE,INACTIVE";

const STATUS_FILTERS = [
  { value: LIVE_STATUSES, label: "All live" },
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" },
];

type ProductRow = ProductSummary & { status?: string };

export function AdminProductsPanel() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(LIVE_STATUSES);
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim());

  // A narrower result set can leave the current page beyond the last one.
  useEffect(() => {
    setPage(1);
  }, [status, query]);

  const products = useAdminProducts({
    page,
    pageSize: PAGE_SIZE,
    status,
    q: query || undefined,
  });

  const items = (products.data?.items ?? []) as ProductRow[];
  const total = products.data?.total ?? items.length;
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

  async function activateMany(rows: ProductRow[], clear: () => void) {
    const pending = rows.filter((row) => row.status !== "ACTIVE");
    if (pending.length === 0) {
      toast.info("Those products are already active");
      return;
    }
    const results = await Promise.allSettled(
      pending.map((row) => activateMutation.mutateAsync(row.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast.success(`${pending.length} product(s) activated`);
    } else {
      toast.error(
        `${pending.length - failed} activated, ${failed} could not be updated`,
      );
    }
    clear();
  }

  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Product",
        meta: { primary: true, label: "Product" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/admin/products/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.slug}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "categoryName",
        header: "Category",
        meta: { secondary: true },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.categoryName ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "productType",
        header: "Type",
        meta: { secondary: true },
        cell: ({ row }) => (
          <MetaChip>
            {row.original.productType === "VARIABLE" ? "Variable" : "Simple"}
          </MetaChip>
        ),
      },
      {
        accessorKey: "basePricePence",
        header: "Price",
        meta: { align: "right" },
        cell: ({ row }) =>
          typeof row.original.basePricePence === "number" ? (
            <PriceDisplay pence={row.original.basePricePence} size="sm" />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <ProductStatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { align: "right", cardFooter: true, className: "w-12" },
        cell: ({ row }) => {
          const product = row.original;
          return (
            <RowActions
              label={product.name}
              actions={[
                {
                  label: "Edit product",
                  href: `/admin/products/${product.id}`,
                  icon: <Pencil aria-hidden />,
                },
                ...(product.status !== "ACTIVE"
                  ? [
                      {
                        label: "Activate",
                        icon: <CheckCircle2 aria-hidden />,
                        onSelect: () => void activate(product.id),
                      },
                    ]
                  : []),
                {
                  label: "Archive",
                  icon: <Archive aria-hidden />,
                  destructive: true,
                  separated: true,
                  onSelect: () => void remove(product.id, product.name),
                },
              ]}
            />
          );
        },
      },
    ],
    // `activate` and `remove` close over the current page only for the
    // page-step-back behaviour, which is safe to recreate on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, items.length],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Products"
        description="Create, edit, stock, and archive catalogue products."
        actions={
          <Link href="/admin/products/new" className={cn(buttonVariants())}>
            <Plus aria-hidden />
            New product
          </Link>
        }
      />

      <DataTable
        caption="Products"
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        isLoading={products.isPending}
        isRefreshing={products.isPlaceholderData}
        isError={products.isError}
        error={products.error}
        onRetry={() => void products.refetch()}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search products by name or SKU"
        toolbar={
          <ToggleFilter
            label="Status"
            options={STATUS_FILTERS}
            value={status}
            onChange={setStatus}
          />
        }
        enableRowSelection
        bulkActions={(rows, clear) => (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void activateMany(rows, clear)}
            disabled={activateMutation.isPending}
          >
            <CheckCircle2 aria-hidden />
            Activate
          </Button>
        )}
        empty={{
          icon: Package,
          title: query
            ? `No products match “${query}”`
            : "No products in this view",
          description: query
            ? "Try a different search term, or clear the search to see everything."
            : "Products you create will appear here. You can also run the catalogue seed.",
          action: query ? (
            <Button variant="outline" size="sm" onClick={() => setSearch("")}>
              Clear search
            </Button>
          ) : (
            <Link
              href="/admin/products/new"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <Plus aria-hidden />
              New product
            </Link>
          ),
        }}
        footer={
          !products.isPending && !products.isError && total > 0 ? (
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
    </div>
  );
}
