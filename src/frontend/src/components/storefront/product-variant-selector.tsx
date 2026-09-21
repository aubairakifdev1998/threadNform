"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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

  async function handleAdd() {
    if (!selectedVariant) return;
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
      {options.map((option) => (
        <div key={option.id} className="space-y-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em]">
            {option.name}
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
                    "border text-xs font-medium transition",
                    isColour
                      ? "size-8"
                      : "flex h-10 min-w-10 items-center justify-center px-2",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/50",
                  )}
                  style={
                    isColour
                      ? {
                          backgroundColor: value.hex ?? undefined,
                          color: "transparent",
                        }
                      : undefined
                  }
                  aria-pressed={isActive}
                  aria-label={value.value}
                  title={value.value}
                >
                  {isColour ? null : value.value}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="inline-flex h-12 w-full items-center justify-center bg-secondary text-sm font-semibold uppercase tracking-[0.16em] text-foreground transition hover:bg-secondary/80 disabled:opacity-50"
        disabled={!selectedVariant || pending}
        onClick={handleAdd}
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Adding…
          </span>
        ) : (
          "Add"
        )}
      </button>
    </div>
  );
}
