import Image from "next/image";
import Link from "next/link";
import { formatGbp } from "@/lib/money";
import type { ProductSummary } from "@/types/api";
import { cn } from "@/lib/utils";

type ProductCardProps = {
  product: ProductSummary;
  className?: string;
};

export function ProductCard({ product, className }: ProductCardProps) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className={cn("group block", className)}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-secondary">
        {product.primaryImageUrl ? (
          <Image
            src={product.primaryImageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
        <span className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full bg-background/90 text-lg opacity-0 shadow-sm transition group-hover:opacity-100 motion-reduce:opacity-0">
          +
        </span>
      </div>
      <div className="mt-3 space-y-1">
        {product.categoryName ? (
          <p className="text-[0.7rem] text-muted-foreground">
            {product.categoryName}
          </p>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-muted-foreground">
            {product.name}
          </h3>
          {typeof product.basePricePence === "number" ? (
            <p className="shrink-0 text-sm tabular-nums text-foreground">
              {formatGbp(product.basePricePence)}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
