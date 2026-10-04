"use client";

import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { PriceDisplay } from "@/components/ui/price";
import { buttonVariants } from "@/components/ui/button";
import type { ProductSummary } from "@/types/api";
import { cn } from "@/lib/utils";

type ProductCardOneProps = {
  product: ProductSummary;
  className?: string;
  sizes?: string;
};

/** CommerCN product-card-01, wired to Fareya catalogue products. */
export function ProductCardOne({
  product,
  className,
  sizes,
}: ProductCardOneProps) {
  const isRange = product.productType === "VARIABLE";
  const soldOut = product.inStock === false;
  const description =
    product.description?.trim() ||
    product.categoryName ||
    product.brandName ||
    "View details";

  return (
    <Card
      className={cn(
        "h-full w-full border-border shadow-none transition hover:border-foreground/25 hover:shadow-e1",
        className,
      )}
    >
      <CardContent className="flex h-full flex-col p-4">
        <Link
          href={`/products/${product.slug}`}
          className="group relative mb-4 block overflow-hidden rounded-xl bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <div className="relative aspect-[3/4]">
            {product.primaryImageUrl ? (
              <Image
                src={product.primaryImageUrl}
                alt={product.name}
                fill
                sizes={
                  sizes ??
                  "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                }
                className={cn(
                  "object-cover transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
                  soldOut && "opacity-60",
                )}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageOff className="size-5" aria-hidden />
                <span className="text-xs">No image yet</span>
              </div>
            )}
            {soldOut ? (
              <span className="absolute top-3 left-3 rounded-full bg-background/95 px-2.5 py-1 text-[0.7rem] font-medium tracking-wide shadow-e1">
                Sold out
              </span>
            ) : null}
          </div>
        </Link>

        <div className="mb-4 flex-1">
          {product.categoryName ? (
            <CardDescription className="mb-1 text-xs tracking-wide uppercase">
              {product.categoryName}
            </CardDescription>
          ) : null}
          <CardTitle className="text-base leading-tight font-semibold">
            <Link
              href={`/products/${product.slug}`}
              className="transition-colors hover:text-muted-foreground"
            >
              {product.name}
            </Link>
          </CardTitle>
          <CardDescription className="mt-1 line-clamp-2 text-sm">
            {description}
          </CardDescription>
        </div>

        <div className="flex items-end justify-between gap-3">
          {typeof product.basePricePence === "number" ? (
            <div>
              {isRange ? (
                <span className="block text-[0.7rem] text-muted-foreground">
                  from
                </span>
              ) : null}
              <PriceDisplay pence={product.basePricePence} size="md" />
            </div>
          ) : (
            <span />
          )}
          <Link
            href={`/products/${product.slug}`}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            {soldOut ? "View" : "Shop"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
