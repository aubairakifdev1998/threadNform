import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { ProductPurchasePanel } from "@/components/storefront/product-purchase-panel";
import { catalogApi } from "@/lib/api";
import { formatGbp } from "@/lib/money";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await catalogApi.getProductBySlug(slug);
    return {
      title: product.name,
      description: product.description ?? undefined,
    };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;

  let product;
  try {
    product = await catalogApi.getProductBySlug(slug);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14 lg:px-8 lg:py-14">
      <ProductGallery
        media={product.media ?? []}
        productName={product.name}
      />
      <div className="space-y-6 border border-border bg-background p-6 sm:p-8 lg:self-start">
        {product.categoryName ? (
          <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
            {product.categoryName}
          </p>
        ) : null}
        <h1 className="heading-display text-3xl sm:text-4xl">{product.name}</h1>
        {typeof product.basePricePence === "number" ? (
          <div>
            <p className="text-xl tabular-nums">{formatGbp(product.basePricePence)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              MRP incl. of all taxes
            </p>
          </div>
        ) : product.price?.basePence != null ? (
          <div>
            <p className="text-xl tabular-nums">
              {formatGbp(
                product.price.salePence ?? product.price.basePence,
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              MRP incl. of all taxes
            </p>
          </div>
        ) : null}
        {product.description ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        ) : null}
        <ProductPurchasePanel
          options={product.options}
          variants={product.variants}
        />
        <div className="flex gap-6 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Link href="/shop" className="hover:text-foreground">
            Find your size
          </Link>
          <Link href="/shop" className="hover:text-foreground">
            Measurement guide
          </Link>
        </div>
      </div>
    </div>
  );
}
