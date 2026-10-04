import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/status";

/**
 * Status chips use semantic colour so order/payment/stock states are
 * scannable. UI chrome elsewhere stays black / white / brand.
 */

const TONE_CHIP: Record<Tone, string> = {
  neutral: "border-border bg-secondary text-foreground",
  info: "border-info/35 bg-info/10 text-info",
  warning:
    "border-warning/45 bg-warning/12 text-[color-mix(in_oklch,var(--warning),black_28%)] dark:text-warning",
  success:
    "border-success/35 bg-success/10 text-[color-mix(in_oklch,var(--success),black_18%)] dark:text-success",
  danger: "border-destructive/35 bg-destructive/10 text-destructive",
};

/** Tinted container for callouts that share a status' tone. */
export const TONE_SURFACE: Record<Tone, string> = {
  neutral: "border-border bg-secondary/50",
  info: "border-info/30 bg-info/5",
  warning: "border-warning/40 bg-warning/10",
  success: "border-success/30 bg-success/5",
  danger: "border-destructive/30 bg-destructive/5",
};

export function StatusBadge({
  tone = "neutral",
  children,
  /** The dot carries no meaning; it reinforces the tone where text is short. */
  dot = true,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
        TONE_CHIP[tone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Neutral chip for facts rather than states — SKU, variant name, a count.
 * Separate from StatusBadge so a tone never reads as a status by accident.
 */
export function MetaChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center rounded-full border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
