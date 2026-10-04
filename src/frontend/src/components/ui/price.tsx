import { formatGbp } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The single way money is shown. Figures are tabular so prices line up in
 * columns, and a "was" price is only ever rendered when it is genuinely higher
 * than what the customer pays.
 */

export type PriceInput = {
  basePence: number;
  salePence?: number | null;
  compareAtPence?: number | null;
} | null;

export type ResolvedPrice = {
  /** What the customer pays. */
  pence: number;
  /** Shown struck through, or null when there is no genuine saving. */
  comparePence: number | null;
  discountPercent: number | null;
};

export function resolvePrice(
  price: PriceInput,
  fallbackPence?: number | null,
): ResolvedPrice | null {
  const base = price?.basePence ?? fallbackPence;
  if (base == null) return null;

  const pence = price?.salePence ?? base;
  const candidate = price?.compareAtPence ?? (price?.salePence ? base : null);
  const comparePence = candidate != null && candidate > pence ? candidate : null;

  return {
    pence,
    comparePence,
    discountPercent: comparePence
      ? Math.round(((comparePence - pence) / comparePence) * 100)
      : null,
  };
}

const SIZE = {
  sm: { now: "text-sm font-medium", was: "text-xs" },
  md: { now: "text-base font-medium", was: "text-sm" },
  lg: { now: "text-xl font-semibold", was: "text-sm" },
} as const;

export function PriceDisplay({
  pence,
  comparePence,
  discountPercent,
  size = "md",
  className,
}: {
  pence: number | null | undefined;
  comparePence?: number | null;
  discountPercent?: number | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const scale = SIZE[size];
  const hasSaving = comparePence != null && pence != null && comparePence > pence;

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("text-numeric text-foreground", scale.now)}>
        {formatGbp(pence)}
      </span>
      {hasSaving ? (
        <>
          <span className={cn("text-numeric text-muted-foreground line-through", scale.was)}>
            {formatGbp(comparePence)}
          </span>
          <span className="sr-only">reduced from {formatGbp(comparePence)}</span>
          {discountPercent ? (
            <span
              className={cn(
                "text-numeric font-medium text-destructive",
                scale.was,
              )}
            >
              −{discountPercent}%
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}

/** Convenience wrapper for the common `price` object + legacy base-price pair. */
export function ProductPrice({
  price,
  fallbackPence,
  size = "md",
  className,
}: {
  price: PriceInput;
  fallbackPence?: number | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const resolved = resolvePrice(price, fallbackPence);
  if (!resolved) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        Price on request
      </span>
    );
  }
  return (
    <PriceDisplay
      pence={resolved.pence}
      comparePence={resolved.comparePence}
      discountPercent={resolved.discountPercent}
      size={size}
      className={className}
    />
  );
}
