import { ProductCard } from "@/components/storefront/product-card";
import type { ProductSummary } from "@/types/api";

export function ProductGrid({
  products,
  emptyMessage = "No products found.",
}: {
  products: ProductSummary[];
  emptyMessage?: string;
}) {
  if (!products.length) {
    return (
      <p className="px-2 py-10 text-center text-sm leading-relaxed text-muted-foreground sm:py-16">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
