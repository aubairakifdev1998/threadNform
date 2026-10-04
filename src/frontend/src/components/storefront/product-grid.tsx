import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { ProductCard } from "@/components/storefront/product-card";
import { EmptyState } from "@/components/ui/data-states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      <EmptyState
        icon={PackageSearch}
        title="Nothing to show yet"
        description={emptyMessage}
        action={
          <Link
            href="/shop"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Browse the shop
          </Link>
        }
        className="py-10 sm:py-16"
      />
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
