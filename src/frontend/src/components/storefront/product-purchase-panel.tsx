"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { catalogApi } from "@/lib/api";
import { ProductVariantSelector } from "@/components/storefront/product-variant-selector";
import { addVariantToGuestCart } from "@/lib/cart/guest-cart";
import { ApiError } from "@/lib/api/client";
import type { ProductOption, ProductVariant } from "@/types/api";

export function ProductPurchasePanel({
  slug,
  options,
  variants,
}: {
  slug: string;
  options?: ProductOption[];
  variants?: ProductVariant[];
}) {
  // Cached page data can be stale either way, so stock state comes only from
  // a live read; until it arrives nothing is shown as sold out.
  const [liveVariants, setLiveVariants] = useState<ProductVariant[] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    catalogApi
      .getLiveProductBySlug(slug)
      .then((live) => {
        if (!cancelled) setLiveVariants(live.variants ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const merged = variants?.map((variant) => {
    const live = liveVariants?.find((v) => v.id === variant.id);
    return { ...variant, available: live?.available, inStock: undefined };
  });

  return (
    <ProductVariantSelector
      options={options}
      variants={merged}
      onAddToCart={async (variantId, quantity) => {
        try {
          await addVariantToGuestCart(variantId, quantity);
          toast.success("Added to bag");
        } catch (error) {
          toast.error(
            error instanceof ApiError ? error.message : "Unable to add to bag",
          );
        }
      }}
    />
  );
}
