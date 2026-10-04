"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProductOption, ProductVariant } from "@/types/api";

export function ProductVariantSelector({
  options = [],
  variants = [],
  onAddToCart,
}: {
  options?: ProductOption[];
  variants?: ProductVariant[];
  onAddToCart?: (variantId: string, quantity: number) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const selectedVariant = useMemo(() => {
    if (!variants.length) return null;
    if (!options.length) return variants[0];

    const fingerprint = Object.values(selected).sort().join("|");
    return (
      variants.find((variant) => variant.optionFingerprint === fingerprint) ??
      null
    );
  }, [options.length, selected, variants]);

  const soldOut =
    selectedVariant != null &&
    (selectedVariant.inStock === false ||
      (typeof selectedVariant.available === "number" &&
        selectedVariant.available <= 0));

  const missingOptions = options.filter((option) => !selected[option.id]);
  const canAdd = Boolean(selectedVariant) && !soldOut && !pending;

  async function handleAdd() {
    if (!selectedVariant || soldOut) return;
    if (!onAddToCart) return;
    setPending(true);
    try {
      await onAddToCart(selectedVariant.id, 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-7">
      {options.map((option) => {
        const activeValue = option.values.find(
          (value) => selected[option.id] === value.value,
        );
        return (
          <div key={option.id} className="space-y-3">
            <p className="label-eyebrow">
              {option.name}
              {activeValue ? (
                <span className="ml-2 font-normal tracking-normal text-muted-foreground normal-case">
                  {activeValue.value}
                </span>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const isActive = selected[option.id] === value.value;
                const isColour = Boolean(value.hex);
                return (
                  <button
                    key={value.id}
                    type="button"
                    onClick={() =>
                      setSelected((prev) => ({
                        ...prev,
                        [option.id]: value.value,
                      }))
                    }
                    className={cn(
                      "border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isColour
                        ? "size-8"
                        : "flex h-10 min-w-10 items-center justify-center px-2",
                      isActive
                        ? isColour
                          ? "border-primary ring-2 ring-primary/35"
                          : "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary/40",
                    )}
                    style={
                      isColour
                        ? {
                            backgroundColor: value.hex ?? undefined,
                          }
                        : undefined
                    }
                    aria-pressed={isActive}
                    aria-label={value.value}
                    title={value.value}
                  >
                    {isColour ? (
                      <span className="sr-only">{value.value}</span>
                    ) : (
                      value.value
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="space-y-2">
        <Button
          type="button"
          className="h-12 w-full text-sm font-semibold uppercase tracking-[0.16em]"
          disabled={!canAdd}
          onClick={() => void handleAdd()}
        >
          {soldOut ? (
            "Sold out"
          ) : pending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Adding…
            </span>
          ) : (
            "Add to bag"
          )}
        </Button>
        {!selectedVariant && missingOptions.length > 0 ? (
          <p className="text-xs text-muted-foreground" role="status">
            Select {missingOptions.map((option) => option.name.toLowerCase()).join(" and ")}{" "}
            to add this piece.
          </p>
        ) : null}
      </div>
    </div>
  );
}
