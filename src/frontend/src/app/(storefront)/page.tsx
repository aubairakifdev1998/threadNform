import type { Metadata } from "next";
import Link from "next/link";
import {
  HeroSpotlight,
  TextGenerateEffect,
} from "@/components/aceternity/spotlight-hero";
import { ProductGrid } from "@/components/storefront/product-grid";
import { ReviewsSection } from "@/components/storefront/reviews-section";
import { catalogApi, siteApi } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { CustomerReview, ProductSummary, SiteBillboard } from "@/types/api";

export const metadata: Metadata = {
  description: BRAND.description,
};

async function getHomeData() {
  let products: ProductSummary[] = [];
  let billboard: SiteBillboard | null = null;
  let reviews: CustomerReview[] = [];
  let filters = null;

  try {
    filters = await catalogApi.getFilters();
  } catch {
    filters = null;
  }

  try {
    billboard = await siteApi.getBillboard();
  } catch {
    billboard = null;
  }

  try {
    reviews = await siteApi.listReviews();
  } catch {
    reviews = [];
  }

  try {
    const result = await catalogApi.listProducts({ pageSize: 8 });
    products = result.items ?? [];
  } catch {
    products = [];
  }

  return { products, billboard, reviews, filters };
}

export default async function HomePage() {
  const { products, billboard, reviews, filters } = await getHomeData();

  const departments = filters?.departments ?? [];
  const categories = (filters?.categories ?? []).slice(0, 6);
  const women = departments.find((d) => d.slug === "women");
  const men = departments.find((d) => d.slug === "men");

  const departmentTiles = [
    women
      ? {
          href: `/shop?departmentId=${women.id}`,
          label: women.name,
          caption: "Shop the edit",
          imageUrl: women.imageUrl ?? null,
        }
      : null,
    men
      ? {
          href: `/shop?departmentId=${men.id}`,
          label: men.name,
          caption: "Shop the edit",
          imageUrl: men.imageUrl ?? null,
        }
      : null,
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    caption: string;
    imageUrl: string | null;
  }>;

  const categoryTiles = categories.map((category) => ({
    href: `/shop?categoryId=${category.id}`,
    label: category.name,
    caption: "Category",
    imageUrl: category.imageUrl ?? null,
  }));

  const browseTiles =
    categoryTiles.length > 0
      ? [
          ...departmentTiles.slice(0, 2),
          ...categoryTiles.slice(
            0,
            Math.max(1, 6 - departmentTiles.slice(0, 2).length),
          ),
        ]
      : departmentTiles.length > 0
        ? [
            ...departmentTiles,
            {
              href: "/shop",
              label: "All products",
              caption: "Browse",
              imageUrl: null as string | null,
            },
          ]
        : [
            {
              href: "/shop",
              label: "Shop",
              caption: "Browse the catalogue",
              imageUrl: null as string | null,
            },
          ];

  return (
    <>
      <HeroSpotlight
        title={billboard?.title ?? BRAND.name}
        seasonLabel={billboard?.seasonLabel ?? "Current edit"}
        subtitle={billboard?.subtitle ?? BRAND.tagline}
        primaryHref={billboard?.ctaHref ?? "/shop"}
        primaryLabel={billboard?.ctaLabel ?? "Shop now"}
        secondaryHref={billboard?.secondaryCtaHref ?? "/shop"}
        secondaryLabel={billboard?.secondaryCtaLabel ?? "View catalogue"}
        mediaType={billboard?.mediaType ?? "NONE"}
        mediaUrl={billboard?.mediaUrl}
        posterUrl={billboard?.posterUrl}
      />

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="heading-display text-3xl sm:text-4xl md:text-5xl">
              <TextGenerateEffect words="Latest pieces" />
            </h2>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              Products published from the admin catalogue.
            </p>
          </div>
          <Link
            href="/shop"
            className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            See all
          </Link>
        </div>

        <div className="mt-12">
          <ProductGrid
            products={products}
            emptyMessage="Publish products in Admin → Products to show them here."
          />
        </div>
      </section>

      <section className="border-y border-border bg-secondary/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="heading-display text-3xl sm:text-4xl">Shop by</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Driven by departments and categories configured in admin.
            </p>
          </div>
          <div
            className={`grid gap-px bg-border ${
              browseTiles.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
            }`}
          >
            {browseTiles.map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="group relative flex min-h-56 flex-col justify-end overflow-hidden bg-background p-8 transition"
              >
                {item.imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/5" />
                  </>
                ) : (
                  <div className="absolute inset-0 bg-secondary/50 transition group-hover:bg-secondary/70" />
                )}
                <span
                  className={`relative z-10 text-[0.65rem] uppercase tracking-[0.2em] ${
                    item.imageUrl ? "text-white/75" : "text-muted-foreground"
                  }`}
                >
                  {item.caption}
                </span>
                <span
                  className={`heading-display relative z-10 mt-2 text-3xl transition-transform duration-500 group-hover:translate-x-1 ${
                    item.imageUrl ? "text-white" : "text-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <ReviewsSection reviews={reviews} />

      <section className="surface-grain relative overflow-hidden py-24">
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="brand-wordmark text-4xl sm:text-5xl">{BRAND.name}</p>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
            {BRAND.description}
          </p>
          <div className="mt-10 flex justify-center">
            <Link
              href="/shop"
              className="relative inline-flex overflow-hidden p-px"
            >
              <span
                className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,oklch(0.35_0.02_265)_50%,transparent_100%)] opacity-70 motion-reduce:hidden"
                aria-hidden
              />
              <span className="relative z-10 inline-flex h-12 items-center bg-foreground px-8 text-sm font-medium tracking-wide text-background">
                Enter the store →
              </span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
