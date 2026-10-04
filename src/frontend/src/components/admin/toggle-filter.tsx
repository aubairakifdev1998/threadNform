"use client";

import { cn } from "@/lib/utils";

/**
 * A segmented filter for a small, fixed set of options. Implemented as a
 * radiogroup rather than a row of buttons so the current choice is announced
 * and arrow keys move between options.
 */
export function ToggleFilter<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: {
    value: T;
    label: string;
    count?: number;
    /** Draws attention to a queue that needs work, e.g. payments to review. */
    urgentWhenCounted?: boolean;
  }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-secondary/50 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              selected
                ? "bg-background text-foreground shadow-e1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count != null ? (
              <span
                className={cn(
                  "text-numeric rounded-full px-1.5 text-[0.7rem]",
                  option.urgentWhenCounted && option.count > 0
                    ? "bg-brand/15 font-semibold text-brand"
                    : selected
                      ? "bg-secondary text-foreground"
                      : "bg-background/60 text-muted-foreground",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
