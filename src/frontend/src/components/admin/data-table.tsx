"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/data-states";
import { cn } from "@/lib/utils";

/**
 * The admin list surface. Every admin table renders through this so sorting,
 * selection, alignment, the loading/empty/error states and the mobile layout
 * behave identically across products, orders, inventory and customers.
 *
 * Pagination stays with the caller because the lists are paged server-side.
 */

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends unknown, TValue> {
    /** Numeric columns right-align so figures can be compared down the column. */
    align?: "left" | "center" | "right";
    /** The column used as the heading of the mobile card. */
    primary?: boolean;
    /** Label for the mobile card; defaults to the column header text. */
    label?: string;
    /** Omitted from the mobile card (redundant or too wide). */
    hideOnCard?: boolean;
    /** Rendered as the mobile card's action row instead of a labelled field. */
    cardFooter?: boolean;
    /** Hidden below `lg`, where horizontal room runs out. */
    secondary?: boolean;
    className?: string;
  }
}

export type DataTableEmpty = {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Describes the table for screen readers. Required — it is the only label. */
  caption: string;
  getRowId?: (row: TData, index: number) => string;

  isLoading?: boolean;
  /** True while a new page is fetched and stale rows are still shown. */
  isRefreshing?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;

  empty: DataTableEmpty;

  /** Filters and view switches, rendered left of the search box. */
  toolbar?: ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  enableRowSelection?: boolean;
  /** Rendered in a bar above the table whenever rows are selected. */
  bulkActions?: (rows: TData[], clearSelection: () => void) => ReactNode;

  /** Mobile card body. Omit to use the generated label/value card. */
  renderCard?: (row: Row<TData>) => ReactNode;
  onRowClick?: (row: TData) => void;
  footer?: ReactNode;
  className?: string;
};

function alignClass(align?: "left" | "center" | "right") {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function headerText<TData>(table: TanstackTable<TData>, columnId: string) {
  const column = table.getColumn(columnId);
  const header = column?.columnDef.header;
  if (typeof header === "string") return header;
  return column?.columnDef.meta?.label ?? columnId;
}

export function DataTable<TData>({
  columns,
  data,
  caption,
  getRowId,
  isLoading = false,
  isRefreshing = false,
  isError = false,
  error,
  onRetry,
  empty,
  toolbar,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  enableRowSelection = false,
  bulkActions,
  renderCard,
  onRowClick,
  footer,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectionColumn = useMemo<ColumnDef<TData, unknown>>(
    () => ({
      id: "__select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(checked)
          }
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
          aria-label="Select row"
          // The row may itself be clickable; selecting must not navigate.
          onClick={(event) => event.stopPropagation()}
        />
      ),
      enableSorting: false,
      meta: { hideOnCard: true, className: "w-10" },
    }),
    [],
  );

  const resolvedColumns = useMemo(
    () => (enableRowSelection ? [selectionColumn, ...columns] : columns),
    [columns, enableRowSelection, selectionColumn],
  );

  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Rows that scrolled out of the current page can't be acted on, so a page
  // or filter change drops the selection rather than silently keeping it.
  useEffect(() => {
    setRowSelection({});
  }, [data]);

  const selectedRows = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);
  const clearSelection = () => setRowSelection({});

  const hasToolbar = Boolean(toolbar) || Boolean(onSearchChange);
  const rows = table.getRowModel().rows;

  return (
    <div className={cn("space-y-4", className)}>
      {hasToolbar ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 p-3 shadow-e1 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between lg:px-4">
          {toolbar ? (
            <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          ) : (
            <p className="label-eyebrow text-muted-foreground">{caption}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            {!isLoading && !isError ? (
              <span className="text-numeric text-xs text-muted-foreground">
                {rows.length} {rows.length === 1 ? "row" : "rows"}
              </span>
            ) : null}
            {onSearchChange ? (
              <div className="relative w-full sm:w-72">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={searchValue ?? ""}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="border-border/80 bg-background pl-9 focus-visible:border-brand/40"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {enableRowSelection && bulkActions && selectedRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/25 bg-accent px-3 py-2.5 shadow-e1">
          <p
            className="text-sm font-medium text-accent-foreground"
            role="status"
            aria-live="polite"
          >
            {selectedRows.length} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions(selectedRows, clearSelection)}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="ml-auto"
          >
            <X className="size-4" aria-hidden />
            Clear
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <DataTableSkeleton
          columns={resolvedColumns.length}
          caption={caption}
        />
      ) : isError ? (
        <div className="overflow-hidden rounded-xl border border-destructive/20 bg-card shadow-e1">
          <ErrorState
            error={error}
            onRetry={onRetry}
            description={`We couldn't load ${caption.toLowerCase()}. Your data is safe — this is a display problem.`}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-dashed border-border bg-card/80 shadow-e1">
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            action={empty.action}
          />
        </div>
      ) : (
        <div
          aria-busy={isRefreshing || undefined}
          className={cn(
            "transition-opacity duration-300",
            isRefreshing && "pointer-events-none opacity-55",
          )}
        >
          <div className="hidden overflow-hidden rounded-xl border border-border/80 bg-card shadow-e2 md:block">
            <Table>
              <caption className="sr-only">{caption}</caption>
              <TableHeader className="sticky top-0 z-10 border-b border-border bg-secondary/90 backdrop-blur-sm">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="border-border/70 hover:bg-transparent"
                  >
                    {headerGroup.headers.map((header) => {
                      const meta = header.column.columnDef.meta;
                      const canSort = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <TableHead
                          key={header.id}
                          scope="col"
                          aria-sort={
                            !canSort
                              ? undefined
                              : sorted === "asc"
                                ? "ascending"
                                : sorted === "desc"
                                  ? "descending"
                                  : "none"
                          }
                          className={cn(
                            "label-meta h-11 px-3.5 text-muted-foreground",
                            alignClass(meta?.align),
                            meta?.secondary && "hidden lg:table-cell",
                            meta?.className,
                          )}
                        >
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                                sorted && "text-foreground",
                                meta?.align === "right" && "flex-row-reverse",
                              )}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {sorted === "asc" ? (
                                <ArrowUp
                                  className="size-3.5 text-brand"
                                  aria-hidden
                                />
                              ) : sorted === "desc" ? (
                                <ArrowDown
                                  className="size-3.5 text-brand"
                                  aria-hidden
                                />
                              ) : (
                                <ChevronsUpDown
                                  className="size-3.5 opacity-35"
                                  aria-hidden
                                />
                              )}
                            </button>
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    onClick={
                      onRowClick ? () => onRowClick(row.original) : undefined
                    }
                    className={cn(
                      "border-border/60 transition-colors",
                      index % 2 === 1 && "bg-secondary/25",
                      "hover:bg-accent/50 data-[state=selected]:bg-accent",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "px-3.5 py-3.5 align-middle",
                            alignClass(meta?.align),
                            meta?.align === "right" && "text-numeric",
                            meta?.secondary && "hidden lg:table-cell",
                            meta?.className,
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden" aria-label={caption}>
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-border/80 bg-card p-4 shadow-e1 transition-colors hover:border-brand/30"
              >
                {renderCard ? (
                  renderCard(row)
                ) : (
                  <GeneratedCard row={row} table={table} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {footer}
    </div>
  );
}

/** Label/value card built from column meta, so tables get a mobile view free. */
function GeneratedCard<TData>({
  row,
  table,
}: {
  row: Row<TData>;
  table: TanstackTable<TData>;
}) {
  const cells = row.getVisibleCells();
  const primary = cells.find((cell) => cell.column.columnDef.meta?.primary);
  const footerCells = cells.filter(
    (cell) => cell.column.columnDef.meta?.cardFooter,
  );
  const fieldCells = cells.filter((cell) => {
    const meta = cell.column.columnDef.meta;
    return !meta?.primary && !meta?.cardFooter && !meta?.hideOnCard;
  });

  return (
    <div className="space-y-3">
      {primary ? (
        <div className="min-w-0">
          {flexRender(primary.column.columnDef.cell, primary.getContext())}
        </div>
      ) : null}

      {fieldCells.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {fieldCells.map((cell) => (
            <div key={cell.id} className="col-span-2 flex items-start justify-between gap-4">
              <dt className="label-meta shrink-0 pt-0.5 text-muted-foreground">
                {headerText(table, cell.column.id)}
              </dt>
              <dd className="min-w-0 text-right">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {footerCells.length ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {footerCells.map((cell) => (
            <div key={cell.id} className="contents">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DataTableSkeleton({
  columns = 5,
  rows = 6,
  caption,
}: {
  columns?: number;
  rows?: number;
  caption?: string;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-e2"
      role="status"
      aria-busy="true"
      aria-label={caption ? `Loading ${caption.toLowerCase()}` : "Loading"}
    >
      <div className="hidden items-center gap-4 border-b border-border bg-secondary/60 px-3.5 py-3.5 md:flex">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn(
              "h-3",
              index === 0 ? "w-36" : index === columns - 1 ? "ml-auto w-14" : "w-20",
            )}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-4 border-b border-border/70 px-3.5 py-4 last:border-b-0",
            index % 2 === 1 && "bg-secondary/20",
          )}
        >
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-24 max-w-[50%]" />
          </div>
          <Skeleton className="hidden h-3.5 w-16 sm:block" />
          <Skeleton className="hidden h-3.5 w-14 md:block" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}
