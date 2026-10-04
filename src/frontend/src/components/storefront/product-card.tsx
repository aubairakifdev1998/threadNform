import { ProductCardOne } from "@/components/commercn/product-cards/product-card-01";
import type { ProductSummary } from "@/types/api";

type ProductCardProps = {
  product: ProductSummary;
  className?: string;
  /** Pass the grid's real sizes so the browser doesn't over-fetch images. */
  sizes?: string;
};

export function ProductCard({ product, className, sizes }: ProductCardProps) {
  return (
    <ProductCardOne product={product} className={className} sizes={sizes} />
  );
}
