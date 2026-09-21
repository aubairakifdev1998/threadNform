"use client";

import { toast } from "sonner";
import { ProductVariantSelector } from "@/components/storefront/product-variant-selector";
import { addVariantToGuestCart } from "@/lib/cart/guest-cart";
import { ApiError } from "@/lib/api/client";
import type { ProductOption, ProductVariant } from "@/types/api";

export function ProductPurchasePanel({
  options,
  variants,
}: {
  options?: ProductOption[];
  variants?: ProductVariant[];
}) {
  return (
    <ProductVariantSelector
      options={options}
      variants={variants}
      onAddToCart={async (variantId, quantity) => {
        try {
          await addVariantToGuestCart(variantId, quantity);
          toast.success("Added to bag");
        } catch (error) {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Unable to add to bag",
          );
        }
      }}
    />
  );
}
