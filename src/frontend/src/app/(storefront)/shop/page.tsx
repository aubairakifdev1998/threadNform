import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopCatalogue } from "@/components/storefront/shop-catalogue";
import { ShopPageShimmer } from "@/components/ui/page-shimmers";
import { catalogApi } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { CatalogFilters, Paginated, ProductSummary } from "@/types/api";

export const metadata: Metadata = {
  title: "Products",
  description: `Browse ${BRAND.name} — filter by category, size, and colour.`,
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopPage({ searchParams }: Props) {
  const raw = await searchParams;
  const params = {
    page: Number(first(raw.page) || 1) || 1,
    pageSize: Number(first(raw.pageSize) || 24) || 24,
    q: first(raw.q) || undefined,
    categoryId: first(raw.categoryId) || undefined,
    brandId: first(raw.brandId) || undefined,
    departmentId: first(raw.departmentId) || undefined,
    collectionId: first(raw.collectionId) || undefined,
    attributeOptionId: first(raw.attributeOptionId) || undefined,
    sizeValueId: first(raw.sizeValueId) || undefined,
    colorId: first(raw.colorId) || undefined,
    inStock:
      first(raw.inStock) === "true"
        ? true
        : first(raw.inStock) === "false"
          ? false
          : undefined,
    minPricePence: first(raw.minPricePence)
      ? Number(first(raw.minPricePence))
      : undefined,
    maxPricePence: first(raw.maxPricePence)
      ? Number(first(raw.maxPricePence))
      : undefined,
  };

  let products: Paginated<ProductSummary> = {
    items: [],
    page: 1,
    pageSize: 24,
    total: 0,
    totalPages: 1,
  };
  let filters: CatalogFilters = {
    departments: [],
    categories: [],
    brands: [],
    collections: [],
    sizes: [],
    colors: [],
    attributes: [],
    priceRange: { minPence: null, maxPence: null },
  };

  try {
    const [productResult, filterResult] = await Promise.all([
      catalogApi.listProducts(params),
      catalogApi.getFilters(),
    ]);
    products = productResult;
    filters = filterResult;
  } catch {
    // keep empty fallbacks — ShopCatalogue will surface live fetch errors
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Suspense fallback={<ShopPageShimmer />}>
        <ShopCatalogue
          initialProducts={products}
          filters={filters}
          emptyMessage="No products match these filters. Adjust filters or add catalogue products in admin."
        />
      </Suspense>
    </div>
  );
}
