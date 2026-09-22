"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { ProductCard } from "@/components/storefront/product-card";
import { FocusCards } from "@/components/aceternity/spotlight-hero";
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

function paramsFromSearch(
  searchParams: URLSearchParams,
): ProductListParams {
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
    pageSize: num("pageSize") ?? 24,
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
    if (key === "pageSize" && value === 24) continue;
    next.set(key, String(value));
  }
  return next;
}

export function ShopCatalogue({
  initialProducts,
  filters,
  emptyMessage = "No products found.",
}: ShopCatalogueProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(initialProducts);
  const [error, setError] = useState<string | null>(null);
  const [draftQ, setDraftQ] = useState(searchParams.get("q") ?? "");
  const [fetching, setFetching] = useState(false);

  const queryKey = searchParams.toString();
  const active = useMemo(
    () => paramsFromSearch(new URLSearchParams(queryKey)),
    [queryKey],
  );

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

  useEffect(() => {
    let cancelled = false;
    const params = paramsFromSearch(new URLSearchParams(queryKey));
    (async () => {
      try {
        setError(null);
        setFetching(true);
        const data = await catalogApi.listProducts(params);
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load products",
          );
        }
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
  }, [initialProducts]);

  const toggleValue = (
    key: keyof ProductListParams,
    value: string | boolean | undefined,
  ) => {
    const current = active[key];
    syncFilters({
      [key]: current === value ? undefined : value,
    } as Partial<ProductListParams>);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          {" / "}
          <span className="text-foreground">Products</span>
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="heading-display text-[clamp(2rem,9vw,3.75rem)] leading-[1.05] sm:text-5xl md:text-6xl">
            Products
          </h1>
          <p className="text-sm text-muted-foreground">
            {fetching || pending ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full bg-foreground" />
                Updating…
              </span>
            ) : (
              <>
                {result.total} item{result.total === 1 ? "" : "s"}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            syncFilters({ q: draftQ.trim() || undefined });
          }}
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Search"
            className="h-11 w-full rounded-full border-0 bg-secondary pl-10 pr-4 text-sm outline-none ring-1 ring-transparent transition focus:ring-foreground/20"
          />
        </form>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() =>
              syncFilters({
                categoryId: undefined,
                departmentId: undefined,
              })
            }
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] transition",
              !active.categoryId && !active.departmentId
                ? "bg-foreground text-background"
                : "bg-secondary text-foreground hover:bg-secondary/80",
            )}
          >
            All
          </button>
          {(filters.departments ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleValue("departmentId", item.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] transition",
                active.departmentId === item.id
                  ? "bg-foreground text-background"
                  : "bg-secondary text-foreground hover:bg-secondary/80",
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-8">
          {(filters.sizes ?? []).length ? (
            <div>
              <p className="mb-3 text-sm font-medium">Size</p>
              <div className="grid grid-cols-3 gap-2">
                {(filters.sizes ?? []).map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => toggleValue("sizeValueId", size.id)}
                    className={cn(
                      "flex h-10 items-center justify-center border text-xs font-medium transition",
                      active.sizeValueId === size.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/50",
                    )}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3 border-t border-border pt-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-3.5 accent-foreground"
                checked={active.inStock === true}
                onChange={(e) =>
                  syncFilters({
                    inStock: e.target.checked ? true : undefined,
                  })
                }
              />
              In stock only
            </label>
            <p className="text-xs text-muted-foreground">
              Showing {result.items.length} of {result.total} from the API
            </p>
          </div>

          <FilterSection title="Category">
            <div className="space-y-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleValue("categoryId", category.id)}
                  className={cn(
                    "block w-full text-left text-sm transition",
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
                  Add categories in Admin → Categories.
                </p>
              ) : null}
            </div>
          </FilterSection>

          {(filters.colors ?? []).length ? (
            <FilterSection title="Colours">
              <div className="flex flex-wrap gap-2">
                {(filters.colors ?? []).map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    title={color.name}
                    aria-label={color.name}
                    onClick={() => toggleValue("colorId", color.id)}
                    className={cn(
                      "size-8 border transition",
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

          <FilterSection title="Price range">
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Catalogue range:{" "}
                {filters.priceRange.minPence != null
                  ? formatGbp(filters.priceRange.minPence)
                  : "—"}{" "}
                –{" "}
                {filters.priceRange.maxPence != null
                  ? formatGbp(filters.priceRange.maxPence)
                  : "—"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  step={100}
                  placeholder="Min £"
                  className="h-10 border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
                  defaultValue={
                    active.minPricePence != null
                      ? active.minPricePence / 100
                      : ""
                  }
                  onBlur={(e) => {
                    const pounds = e.target.value
                      ? Math.round(Number(e.target.value) * 100)
                      : undefined;
                    syncFilters({
                      minPricePence:
                        pounds !== undefined && Number.isFinite(pounds)
                          ? pounds
                          : undefined,
                    });
                  }}
                />
                <input
                  type="number"
                  min={0}
                  step={100}
                  placeholder="Max £"
                  className="h-10 border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
                  defaultValue={
                    active.maxPricePence != null
                      ? active.maxPricePence / 100
                      : ""
                  }
                  onBlur={(e) => {
                    const pounds = e.target.value
                      ? Math.round(Number(e.target.value) * 100)
                      : undefined;
                    syncFilters({
                      maxPricePence:
                        pounds !== undefined && Number.isFinite(pounds)
                          ? pounds
                          : undefined,
                    });
                  }}
                />
              </div>
            </div>
          </FilterSection>

          {(active.q ||
            active.categoryId ||
            active.departmentId ||
            active.sizeValueId ||
            active.colorId ||
            active.inStock ||
            active.minPricePence != null ||
            active.maxPricePence != null) && (
            <button
              type="button"
              onClick={() =>
                syncFilters({
                  q: undefined,
                  categoryId: undefined,
                  brandId: undefined,
                  departmentId: undefined,
                  collectionId: undefined,
                  sizeValueId: undefined,
                  colorId: undefined,
                  attributeOptionId: undefined,
                  inStock: undefined,
                  minPricePence: undefined,
                  maxPricePence: undefined,
                  page: 1,
                })
              }
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              Clear all filters
            </button>
          )}
        </aside>

        <div className={cn(fetching || pending ? "opacity-70 transition-opacity" : "")}>
          {error ? (
            <p className="py-16 text-center text-sm text-destructive">{error}</p>
          ) : fetching && !result.items.length ? (
            <ProductGridShimmer />
          ) : !result.items.length ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <FocusCards>
              {result.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </FocusCards>
          )}

          {result.totalPages > 1 ? (
            <div className="mt-10 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={result.page <= 1 || pending}
                onClick={() => syncFilters({ page: result.page - 1 })}
                className="border border-border px-4 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {result.page} of {result.totalPages}
              </span>
              <button
                type="button"
                disabled={result.page >= result.totalPages || pending}
                onClick={() => syncFilters({ page: result.page + 1 })}
                className="border border-border px-4 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
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
    <details open className="border-t border-border pt-4">
      <summary className="cursor-pointer list-none text-sm font-medium">
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
