import type { Metadata } from "next";
import Link from "next/link";
import {
  HeroSpotlight,
  TextGenerateEffect,
} from "@/components/aceternity/spotlight-hero";
import { Section, SectionHeader } from "@/components/layout/section";
import { CategoryOne } from "@/components/commercn/categories/category-01";
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

  const departments = (filters?.departments ?? []).filter(
    (department) => department.isActive !== false,
  );
  const categories = (filters?.categories ?? []).filter(
    (category) => category.isActive !== false,
  );

  const departmentItems = departments.map((department) => ({
    id: department.id,
    href: `/shop?departmentId=${department.id}`,
    title: department.name,
    count: "Department",
    imageSrc: department.imageUrl ?? null,
  }));

  const categoryItems = categories.map((category) => ({
    id: category.id,
    href: `/shop?categoryId=${category.id}`,
    title: category.name,
    count: "Category",
    imageSrc: category.imageUrl ?? null,
  }));

  const primaryDept = departmentItems[0];

  return (
    <>
      <HeroSpotlight
        title={billboard?.title ?? BRAND.name}
        seasonLabel={billboard?.seasonLabel ?? "Current edit"}
        subtitle={billboard?.subtitle ?? BRAND.tagline}
        primaryHref={billboard?.ctaHref ?? "/shop"}
        primaryLabel={billboard?.ctaLabel ?? "Shop now"}
        secondaryHref={
          billboard?.secondaryCtaHref ?? primaryDept?.href ?? "/shop"
        }
        secondaryLabel={
          billboard?.secondaryCtaLabel ??
          (primaryDept ? primaryDept.title : "Browse the shop")
        }
        mediaType={billboard?.mediaType ?? "NONE"}
        mediaUrl={billboard?.mediaUrl}
        posterUrl={billboard?.posterUrl}
      />

      <Section space="loose">
        <SectionHeader
          eyebrow="New"
          title={<TextGenerateEffect words="Latest pieces" />}
          description="New arrivals and restocks from the current edit."
          action={
            <Link
              href="/shop"
              className="label-eyebrow text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              See all
            </Link>
          }
        />
        <div className="mt-8 sm:mt-12">
          <ProductGrid
            products={products}
            emptyMessage="The shop is being restocked. Check back shortly, or browse again soon."
          />
        </div>
      </Section>

      {departmentItems.length > 0 ? (
        <div className="border-y border-border bg-secondary/30">
          <Section space="loose">
            <CategoryOne
              title="Shop by department"
              description="Departments from your catalogue — managed in admin, shown here automatically."
              viewAllHref="/shop"
              viewAllLabel="All products"
              items={departmentItems}
            />
          </Section>
        </div>
      ) : null}

      {categoryItems.length > 0 ? (
        <Section space="loose">
          <CategoryOne
            title="Shop by category"
            description="Product types within a department — tracksuits, trainers, and the rest of the edit."
            viewAllHref="/shop"
            viewAllLabel="Browse shop"
            items={categoryItems}
          />
        </Section>
      ) : null}

      <ReviewsSection reviews={reviews} />

      <section className="surface-grain relative overflow-hidden py-16 sm:py-24">
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="brand-wordmark text-[clamp(1.75rem,8vw,3rem)] sm:text-5xl">
            {BRAND.name}
          </p>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
            {BRAND.description}
          </p>
          <div className="mt-8 flex justify-center sm:mt-10">
            <Link
              href="/shop"
              className="inline-flex h-12 items-center justify-center bg-primary px-8 text-sm font-medium tracking-wide text-primary-foreground shadow-e2 transition hover:bg-[color-mix(in_oklch,var(--primary),black_8%)]"
            >
              Enter the store →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
