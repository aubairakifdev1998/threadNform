"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PackageSearch, Search, SlidersHorizontal, X } from "lucide-react";
import { ProductCard } from "@/components/storefront/product-card";
import { FocusCards } from "@/components/aceternity/spotlight-hero";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/data-states";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { catalogApi } from "@/lib/api";
import type {
  CatalogFilters,
  Paginated,
  ProductListParams,
  ProductSummary,
} from "@/types/api";
import { cn } from "@/lib/utils";
import { formatGbp } from "@/lib/money";
import { ProductGridShimmer } from "@/components/ui/page-shimmers";

type ShopCatalogueProps = {
  initialProducts: Paginated<ProductSummary>;
  filters: CatalogFilters;
  emptyMessage?: string;
};

const PAGE_SIZE = 24;

/** Filter keys only — `page` and `pageSize` are navigation, not filtering. */
const FILTER_KEYS = [
  "q",
  "categoryId",
  "brandId",
  "departmentId",
  "collectionId",
  "attributeOptionId",
  "sizeValueId",
  "colorId",
  "inStock",
  "minPricePence",
  "maxPricePence",
] as const satisfies readonly (keyof ProductListParams)[];

const CLEARED = Object.fromEntries(
  FILTER_KEYS.map((key) => [key, undefined]),
) as Partial<ProductListParams>;

function paramsFromSearch(searchParams: URLSearchParams): ProductListParams {
  const bool = (key: string) => {
    const value = searchParams.get(key);
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  };
  const num = (key: string) => {
    const value = searchParams.get(key);
    if (!value) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    page: num("page") ?? 1,
    pageSize: num("pageSize") ?? PAGE_SIZE,
    q: searchParams.get("q") || undefined,
    categoryId: searchParams.get("categoryId") || undefined,
    brandId: searchParams.get("brandId") || undefined,
    departmentId: searchParams.get("departmentId") || undefined,
    collectionId: searchParams.get("collectionId") || undefined,
    attributeOptionId: searchParams.get("attributeOptionId") || undefined,
    sizeValueId: searchParams.get("sizeValueId") || undefined,
    colorId: searchParams.get("colorId") || undefined,
    inStock: bool("inStock"),
    minPricePence: num("minPricePence"),
    maxPricePence: num("maxPricePence"),
  };
}

function toSearchParams(params: ProductListParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "page" && value === 1) continue;
    if (key === "pageSize" && value === PAGE_SIZE) continue;
    next.set(key, String(value));
  }
  return next;
}

export function ShopCatalogue({
  initialProducts,
  filters,
  emptyMessage = "No products match these filters.",
}: ShopCatalogueProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(initialProducts);
  const [error, setError] = useState<unknown>(null);
  const [draftQ, setDraftQ] = useState(searchParams.get("q") ?? "");
  const [fetching, setFetching] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const queryKey = searchParams.toString();
  const active = useMemo(
    () => paramsFromSearch(new URLSearchParams(queryKey)),
    [queryKey],
  );

  // The server already rendered this exact query, so skip the duplicate fetch
  // on first paint and only go to the network when the filters actually change.
  const servedKey = useRef<string | null>(queryKey);

  const categories = useMemo(
    () => filters.categories ?? [],
    [filters.categories],
  );

  const syncFilters = useCallback(
    (patch: Partial<ProductListParams>) => {
      const nextParams: ProductListParams = {
        ...active,
        ...patch,
        page: patch.page ?? 1,
      };
      const qs = toSearchParams(nextParams).toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [active, pathname, router],
  );

  useEffect(() => {
    setDraftQ(active.q ?? "");
  }, [active.q]);

  const load = useCallback(
    async (key: string) => {
      setError(null);
      setFetching(true);
      try {
        const data = await catalogApi.listProducts(
          paramsFromSearch(new URLSearchParams(key)),
        );
        setResult(data);
        return true;
      } catch (err) {
        setError(err);
        return false;
      } finally {
        setFetching(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (servedKey.current === queryKey) return;
    let cancelled = false;
    (async () => {
      const key = queryKey;
      setError(null);
      setFetching(true);
      try {
        const data = await catalogApi.listProducts(
          paramsFromSearch(new URLSearchParams(key)),
        );
        if (!cancelled) {
          setResult(data);
          servedKey.current = key;
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryKey]);

  useEffect(() => {
    setResult(initialProducts);
    servedKey.current = queryKey;
    // Only when the server sends a new page, not on every query change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProducts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#shop-search") return;
    document.getElementById("shop-search")?.focus();
  }, []);

  const toggleValue = (
    key: keyof ProductListParams,
    value: string | boolean | undefined,
  ) => {
    const current = active[key];
    syncFilters({
      [key]: current === value ? undefined : value,
    } as Partial<ProductListParams>);
  };

  /** Applied filters as removable chips, so nothing is hidden in a panel. */
  const appliedChips = useMemo(() => {
    const chips: { key: string; label: string; clear: Partial<ProductListParams> }[] =
      [];
    if (active.q)
      chips.push({
        key: "q",
        label: `“${active.q}”`,
        clear: { q: undefined },
      });
    const department = (filters.departments ?? []).find(
      (d) => d.id === active.departmentId,
    );
    if (department)
      chips.push({
        key: "departmentId",
        label: department.name,
        clear: { departmentId: undefined },
      });
    const category = categories.find((c) => c.id === active.categoryId);
    if (category)
      chips.push({
        key: "categoryId",
        label: category.name,
        clear: { categoryId: undefined },
      });
    const size = (filters.sizes ?? []).find((s) => s.id === active.sizeValueId);
    if (size)
      chips.push({
        key: "sizeValueId",
        label: `Size ${size.label}`,
        clear: { sizeValueId: undefined },
      });
    const color = (filters.colors ?? []).find((c) => c.id === active.colorId);
    if (color)
      chips.push({
        key: "colorId",
        label: color.name,
        clear: { colorId: undefined },
      });
    if (active.inStock)
      chips.push({
        key: "inStock",
        label: "In stock only",
        clear: { inStock: undefined },
      });
    if (active.minPricePence != null)
      chips.push({
        key: "minPricePence",
        label: `From ${formatGbp(active.minPricePence)}`,
        clear: { minPricePence: undefined },
      });
    if (active.maxPricePence != null)
      chips.push({
        key: "maxPricePence",
        label: `Up to ${formatGbp(active.maxPricePence)}`,
        clear: { maxPricePence: undefined },
      });
    return chips;
  }, [active, categories, filters]);

  const busy = fetching || pending;

  const filterControls = (
    <FilterControls
      active={active}
      filters={filters}
      categories={categories}
      onChange={syncFilters}
      onToggle={toggleValue}
    />
  );

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Shop</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="heading-display text-[clamp(2rem,9vw,3.75rem)] leading-[1.05] sm:text-5xl md:text-6xl">
            Shop
          </h1>
          <p
            className="text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                Updating…
              </span>
            ) : (
              <>
                <span className="text-numeric">{result.total}</span> item
                {result.total === 1 ? "" : "s"} · newest first
              </>
            )}
          </p>
        </div>
      </div>

      {/* Search + department shortcuts + mobile filter trigger */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            className="relative flex-1"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              syncFilters({ q: draftQ.trim() || undefined });
            }}
          >
            <Label htmlFor="shop-search" className="sr-only">
              Search products
            </Label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="shop-search"
              type="search"
              value={draftQ}
              onChange={(event) => setDraftQ(event.target.value)}
              placeholder="Search products"
              className="h-11 rounded-full border-0 bg-secondary pr-24 pl-10 ring-1 ring-transparent focus-visible:ring-foreground/20"
            />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="absolute top-1/2 right-1.5 h-8 -translate-y-1/2 rounded-full px-3"
            >
              Search
            </Button>
          </form>

          {/* Filters live in a drawer on phones: the sidebar pushed the grid
              a full screen down. */}
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 shrink-0 rounded-full lg:hidden"
                />
              }
            >
              <SlidersHorizontal aria-hidden />
              Filters
              {appliedChips.length > 0 ? (
                <span className="text-numeric ml-0.5 rounded-full bg-primary px-1.5 text-[0.7rem] text-primary-foreground">
                  {appliedChips.length}
                </span>
              ) : null}
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[85svh] overflow-y-auto rounded-t-xl"
            >
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4">{filterControls}</div>
              <div className="sticky bottom-0 flex gap-2 border-t border-border bg-popover p-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => syncFilters({ ...CLEARED, page: 1 })}
                  disabled={appliedChips.length === 0}
                >
                  Clear all
                </Button>
                <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                  Show {result.total} item{result.total === 1 ? "" : "s"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label="Shop by department"
        >
          <DepartmentChip
            selected={!active.categoryId && !active.departmentId}
            onClick={() =>
              syncFilters({ categoryId: undefined, departmentId: undefined })
            }
          >
            All
          </DepartmentChip>
          {(filters.departments ?? []).map((item) => (
            <DepartmentChip
              key={item.id}
              selected={active.departmentId === item.id}
              onClick={() => toggleValue("departmentId", item.id)}
            >
              {item.name}
            </DepartmentChip>
          ))}
        </div>

        {appliedChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-eyebrow text-muted-foreground">Applied</span>
            {appliedChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => syncFilters(chip.clear)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {chip.label}
                <X className="size-3" aria-hidden />
                <span className="sr-only">Remove this filter</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => syncFilters({ ...CLEARED, page: 1 })}
              className="text-xs font-medium underline underline-offset-4"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Product filters">
          {filterControls}
        </aside>

        <div>
          {error ? (
            <div className="rounded-lg border border-border bg-card">
              <ErrorState
                error={error}
                onRetry={() => void load(queryKey)}
                description="We couldn't load products just now."
              />
            </div>
          ) : busy && !result.items.length ? (
            <ProductGridShimmer />
          ) : !result.items.length ? (
            <div className="rounded-lg border border-dashed border-border bg-card">
              <EmptyState
                icon={PackageSearch}
                title={
                  appliedChips.length > 0
                    ? "Nothing matches those filters"
                    : "No products yet"
                }
                description={
                  appliedChips.length > 0
                    ? "Try removing a filter, or widening the price range."
                    : emptyMessage
                }
                action={
                  appliedChips.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncFilters({ ...CLEARED, page: 1 })}
                    >
                      Clear all filters
                    </Button>
                  ) : (
                    <Link
                      href="/"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                      )}
                    >
                      Back to home
                    </Link>
                  )
                }
              />
            </div>
          ) : (
            <div
              aria-busy={busy || undefined}
              className={cn(busy && "opacity-70 transition-opacity")}
            >
              <FocusCards>
                {result.items.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
                  />
                ))}
              </FocusCards>
            </div>
          )}

          {result.totalPages > 1 && !error ? (
            <nav
              className="mt-10 flex items-center justify-center gap-4"
              aria-label="Product pages"
            >
              <Button
                variant="outline"
                disabled={result.page <= 1 || busy}
                onClick={() => syncFilters({ page: result.page - 1 })}
              >
                Previous
              </Button>
              <span className="text-numeric text-sm text-muted-foreground">
                Page {result.page} of {result.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={result.page >= result.totalPages || busy}
                onClick={() => syncFilters({ page: result.page + 1 })}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DepartmentChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "label-eyebrow shrink-0 rounded-full px-4 py-2.5 transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected
          ? "bg-primary text-primary-foreground shadow-e1"
          : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilterControls({
  active,
  filters,
  categories,
  onChange,
  onToggle,
}: {
  active: ProductListParams;
  filters: CatalogFilters;
  categories: CatalogFilters["categories"];
  onChange: (patch: Partial<ProductListParams>) => void;
  onToggle: (
    key: keyof ProductListParams,
    value: string | boolean | undefined,
  ) => void;
}) {
  return (
    <div className="space-y-6 pt-4 lg:pt-0">
      <div className="flex items-center gap-2">
        <Checkbox
          id="filter-in-stock"
          checked={active.inStock === true}
          onCheckedChange={(checked) =>
            onChange({ inStock: checked ? true : undefined })
          }
        />
        <Label htmlFor="filter-in-stock" className="text-sm font-normal">
          In stock only
        </Label>
      </div>

      {(filters.sizes ?? []).length ? (
        <FilterSection title="Size">
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-3">
            {(filters.sizes ?? []).map((size) => (
              <button
                key={size.id}
                type="button"
                aria-pressed={active.sizeValueId === size.id}
                onClick={() => onToggle("sizeValueId", size.id)}
                className={cn(
                  "flex h-10 items-center justify-center rounded-md border text-xs font-medium transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active.sizeValueId === size.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:border-primary/40 hover:bg-accent/50",
                )}
              >
                {size.label}
              </button>
            ))}
          </div>
        </FilterSection>
      ) : null}

      <FilterSection title="Category">
        <div className="space-y-1">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={active.categoryId === category.id}
              onClick={() => onToggle("categoryId", category.id)}
              className={cn(
                "block w-full rounded-sm px-1 py-1.5 text-left text-sm transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active.categoryId === category.id
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {category.name}
            </button>
          ))}
          {!categories.length ? (
            <p className="text-xs text-muted-foreground">
              No categories yet.
            </p>
          ) : null}
        </div>
      </FilterSection>

      {(filters.colors ?? []).length ? (
        <FilterSection title="Colour">
          <div className="flex flex-wrap gap-2">
            {(filters.colors ?? []).map((color) => (
              <button
                key={color.id}
                type="button"
                title={color.name}
                aria-label={color.name}
                aria-pressed={active.colorId === color.id}
                onClick={() => onToggle("colorId", color.id)}
                className={cn(
                  "size-9 rounded-md border transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active.colorId === color.id
                    ? "border-foreground ring-2 ring-foreground/30"
                    : "border-border",
                )}
                style={{ backgroundColor: color.hex ?? "#d4d4d4" }}
              />
            ))}
          </div>
        </FilterSection>
      ) : null}

      <FilterSection title="Price">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Catalogue range{" "}
            <span className="text-numeric">
              {filters.priceRange.minPence != null
                ? formatGbp(filters.priceRange.minPence)
                : "—"}
            </span>{" "}
            –{" "}
            <span className="text-numeric">
              {filters.priceRange.maxPence != null
                ? formatGbp(filters.priceRange.maxPence)
                : "—"}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="filter-min-price" className="text-xs">
                Min £
              </Label>
              <Input
                id="filter-min-price"
                type="number"
                inputMode="decimal"
                min={0}
                step={5}
                className="text-numeric"
                defaultValue={
                  active.minPricePence != null ? active.minPricePence / 100 : ""
                }
                onBlur={(event) => {
                  const pence = event.target.value
                    ? Math.round(Number(event.target.value) * 100)
                    : undefined;
                  onChange({
                    minPricePence:
                      pence !== undefined && Number.isFinite(pence)
                        ? pence
                        : undefined,
                  });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-max-price" className="text-xs">
                Max £
              </Label>
              <Input
                id="filter-max-price"
                type="number"
                inputMode="decimal"
                min={0}
                step={5}
                className="text-numeric"
                defaultValue={
                  active.maxPricePence != null ? active.maxPricePence / 100 : ""
                }
                onBlur={(event) => {
                  const pence = event.target.value
                    ? Math.round(Number(event.target.value) * 100)
                    : undefined;
                  onChange({
                    maxPricePence:
                      pence !== undefined && Number.isFinite(pence)
                        ? pence
                        : undefined,
                  });
                }}
              />
            </div>
          </div>
        </div>
      </FilterSection>
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-5">
      <h3 className="label-meta mb-3 text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
