import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { ProductPurchasePanel } from "@/components/storefront/product-purchase-panel";
import { Section } from "@/components/layout/section";
import { ProductPrice } from "@/components/ui/price";
import { catalogApi } from "@/lib/api";

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
    <Section
      as="div"
      space="default"
      className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14"
    >
      <ProductGallery media={product.media ?? []} productName={product.name} />
      <div className="space-y-6 lg:self-start">
        {product.categoryName ? (
          <p className="label-eyebrow text-muted-foreground">
            {product.categoryName}
          </p>
        ) : null}
        <h1 className="heading-display text-3xl sm:text-4xl">{product.name}</h1>
        <div>
          <ProductPrice
            price={product.price ?? null}
            fallbackPence={product.basePricePence}
            size="lg"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Price includes VAT. UK shipping calculated at checkout.
          </p>
        </div>
        {product.description ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        ) : null}
        <ProductPurchasePanel
          slug={product.slug}
          options={product.options}
          variants={product.variants}
        />
        <dl className="grid gap-3 border-t border-border pt-6 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>UK delivery only · calculated at checkout</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Returns</dt>
            <dd>Unused items within 14 days of delivery</dd>
          </div>
        </dl>
      </div>
    </Section>
  );
}
