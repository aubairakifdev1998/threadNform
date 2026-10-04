"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  Archive,
  BookOpen,
  Crown,
  Mail,
  Phone,
  ShoppingBag,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import { DataTable } from "@/components/admin/data-table";
import { ToggleFilter } from "@/components/admin/toggle-filter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceDisplay } from "@/components/ui/price";
import { CustomerStatusBadge } from "@/components/status/status-badges";
import { MetaChip } from "@/components/ui/status-badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { formatDate } from "@/lib/orders/presentation";
import {
  requireAccessToken,
  useAdminCustomerDiary,
  type CustomerDiaryRow,
} from "@/lib/query/admin";

const PAGE_SIZE = 20;

type SortKey = "spend" | "orders" | "recent";

/**
 * Separate analysis surface from the customers CRUD list — ranked shoppers
 * with contact details, lifetime order volume, spend, and favourite product.
 */
function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function AdminCustomerDiaryPanel() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("spend");
  const query = useDebouncedValue(search.trim());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayIsoDate);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const diary = useAdminCustomerDiary({
    page,
    pageSize: PAGE_SIZE,
    q: query || undefined,
    sort,
  });

  async function previewArchive() {
    if (!fromDate || !toDate) {
      toast.error("Choose a start and end date");
      return;
    }
    setArchiving(true);
    setPreviewCount(null);
    try {
      const result = await adminApi.archiveCustomerPeriod(
        requireAccessToken(),
        { fromDate, toDate, dryRun: true },
      );
      setPreviewCount(result.orderCount);
      toast.message(
        result.orderCount === 0
          ? "No orders in that period"
          : `${result.orderCount} order${result.orderCount === 1 ? "" : "s"} would be archived`,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Preview failed",
      );
    } finally {
      setArchiving(false);
    }
  }

  async function confirmArchive() {
    if (!fromDate || !toDate) {
      toast.error("Choose a start and end date");
      return;
    }
    if (
      !window.confirm(
        `Archive all customer order data from ${fromDate} to ${toDate}? Those orders will disappear from the admin portal, customer diary, and account order history. This cannot be undone from the UI.`,
      )
    ) {
      return;
    }
    setArchiving(true);
    try {
      const result = await adminApi.archiveCustomerPeriod(
        requireAccessToken(),
        { fromDate, toDate, dryRun: false },
      );
      setPreviewCount(null);
      toast.success(
        result.orderCount === 0
          ? "Nothing to archive in that period"
          : `Archived ${result.orderCount} order${result.orderCount === 1 ? "" : "s"}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Archive failed",
      );
    } finally {
      setArchiving(false);
    }
  }

  const items = diary.data?.items ?? [];
  const total = diary.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const topSpender = !query && sort === "spend" && page === 1 ? items[0] : null;
  const topBuyer =
    !query && page === 1
      ? [...items].sort((a, b) => b.orderCount - a.orderCount)[0]
      : null;

  const columns = useMemo<ColumnDef<CustomerDiaryRow, unknown>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        enableSorting: false,
        meta: { className: "w-12", label: "Rank" },
        cell: ({ row }) => (
          <span className="text-numeric text-muted-foreground">
            {(page - 1) * PAGE_SIZE + row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: "fullName",
        header: "Customer",
        meta: { primary: true, label: "Customer" },
        cell: ({ row }) => {
          const entry = row.original;
          return (
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {entry.fullName ?? "Guest shopper"}
                </span>
                {entry.status ? (
                  <CustomerStatusBadge status={entry.status} />
                ) : (
                  <MetaChip>Guest</MetaChip>
                )}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{entry.email}</span>
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="size-3 shrink-0" aria-hidden />
                <span className="text-numeric">{entry.phone ?? "No phone"}</span>
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "orderCount",
        header: "Orders",
        meta: { label: "Orders placed" },
        cell: ({ row }) => (
          <span className="text-numeric font-medium">
            {row.original.orderCount}
          </span>
        ),
      },
      {
        accessorKey: "totalSpendPence",
        header: "Lifetime spent",
        meta: { label: "Lifetime spent" },
        cell: ({ row }) => (
          <PriceDisplay pence={row.original.totalSpendPence} size="sm" />
        ),
      },
      {
        accessorKey: "topProductName",
        header: "Buys most",
        meta: { secondary: true, label: "Most bought" },
        cell: ({ row }) => {
          const { topProductName, topProductQuantity } = row.original;
          if (!topProductName) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <div className="min-w-0">
              <p className="truncate font-medium">{topProductName}</p>
              <p className="text-numeric text-xs text-muted-foreground">
                {topProductQuantity} unit{topProductQuantity === 1 ? "" : "s"}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "lastOrderAt",
        header: "Last order",
        meta: { secondary: true },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(row.original.lastOrderAt, true)}
          </span>
        ),
      },
      {
        id: "open",
        header: "",
        enableSorting: false,
        meta: { align: "right", cardFooter: true, className: "w-28" },
        cell: ({ row }) => {
          const entry = row.original;
          const href = entry.customerId
            ? `/admin/customers?focus=${entry.customerId}`
            : `/admin/orders?q=${encodeURIComponent(entry.email)}`;
          return (
            <Link
              href={href}
              className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-[0.8rem] font-medium hover:bg-secondary"
            >
              {entry.customerId ? "Profile" : "Orders"}
            </Link>
          );
        },
      },
    ],
    [page],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Customer diary"
        description="Who buys, how often, and what they prefer — ranked so you can stay close to your best customers."
      />

      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-2">
            <Archive className="size-4" aria-hidden />
            Archive a period
          </CardDescription>
          <CardTitle className="text-base">
            Hide customer order data from the portal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Soft-archives every order placed in the selected dates (UK calendar).
            Archived orders leave admin lists, the diary, payments queue, and
            customer account history — records stay in the database for audit.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="archive-from">From</Label>
              <Input
                id="archive-from"
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setPreviewCount(null);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="archive-to">To</Label>
              <Input
                id="archive-to"
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setPreviewCount(null);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={archiving || !fromDate || !toDate}
                onClick={() => void previewArchive()}
              >
                Preview count
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={archiving || !fromDate || !toDate}
                onClick={() => void confirmArchive()}
              >
                Archive period
              </Button>
            </div>
          </div>
          {previewCount != null ? (
            <p className="text-sm text-muted-foreground">
              Preview:{" "}
              <span className="font-medium text-foreground">
                {previewCount} order{previewCount === 1 ? "" : "s"}
              </span>{" "}
              in range.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {(topSpender || topBuyer) && (
        <div className="grid gap-4 md:grid-cols-2">
          {topSpender ? (
            <HighlightCard
              eyebrow="Highest spend"
              icon={Crown}
              entry={topSpender}
              metric={
                <PriceDisplay pence={topSpender.totalSpendPence} size="lg" />
              }
            />
          ) : null}
          {topBuyer ? (
            <HighlightCard
              eyebrow="Most orders"
              icon={ShoppingBag}
              entry={topBuyer}
              metric={
                <span className="text-numeric text-2xl font-semibold tracking-tight">
                  {topBuyer.orderCount} orders
                </span>
              }
            />
          ) : null}
        </div>
      )}

      <DataTable
        caption="Customer diary"
        columns={columns}
        data={items}
        getRowId={(row) => row.email}
        isLoading={diary.isPending}
        isRefreshing={diary.isPlaceholderData}
        isError={diary.isError}
        error={diary.error}
        onRetry={() => void diary.refetch()}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search email, phone, or name"
        toolbar={
          <ToggleFilter
            label="Sort diary"
            value={sort}
            onChange={setSort}
            options={[
              { value: "spend", label: "By spend" },
              { value: "orders", label: "By orders" },
              { value: "recent", label: "Most recent" },
            ]}
          />
        }
        empty={{
          icon: BookOpen,
          title: query
            ? `No diary entries match “${query}”`
            : "No order history yet",
          description: query
            ? "Try another email, phone, or name."
            : "As customers place orders, their buying pattern appears here.",
          action: query ? (
            <Button variant="outline" size="sm" onClick={() => setSearch("")}>
              Clear search
            </Button>
          ) : undefined,
        }}
        footer={
          !diary.isPending && !diary.isError && total > 0 ? (
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

function HighlightCard({
  eyebrow,
  icon: Icon,
  entry,
  metric,
}: {
  eyebrow: string;
  icon: React.ComponentType<{ className?: string }>;
  entry: CustomerDiaryRow;
  metric: React.ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" aria-hidden />
          {eyebrow}
        </CardDescription>
        <CardTitle className="text-base">
          {entry.fullName ?? entry.email}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {metric}
        <p className="text-sm text-muted-foreground">
          {entry.email}
          {entry.phone ? ` · ${entry.phone}` : ""}
        </p>
        {entry.topProductName ? (
          <p className="text-sm">
            Buys most:{" "}
            <span className="font-medium">{entry.topProductName}</span>
            <span className="text-muted-foreground">
              {" "}
              ({entry.topProductQuantity})
            </span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
