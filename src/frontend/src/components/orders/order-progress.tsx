import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Step } from "@/lib/orders/presentation";

/** Horizontal tracker on wide screens, vertical list on phones. */
export function OrderProgress({ steps }: { steps: Step[] }) {
  return (
    <ol
      className="grid gap-3 sm:grid-cols-5 sm:gap-0"
      aria-label="Order progress"
    >
      {steps.map((step, index) => (
        <li
          key={step.key}
          className="relative flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
          aria-current={step.state === "current" ? "step" : undefined}
        >
          {index > 0 ? (
            <span
              aria-hidden
              className={cn(
                "absolute top-3.5 right-1/2 hidden h-px w-full sm:block",
                step.state === "upcoming" ? "bg-border" : "bg-foreground",
              )}
            />
          ) : null}
          <span
            className={cn(
              "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
              step.state === "done" &&
                "border-foreground bg-foreground text-background",
              step.state === "current" &&
                "border-foreground bg-background text-foreground ring-4 ring-foreground/10",
              step.state === "upcoming" &&
                "border-border bg-background text-muted-foreground",
            )}
          >
            {step.state === "done" ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              index + 1
            )}
          </span>
          <span
            className={cn(
              "text-sm sm:text-xs sm:font-medium sm:uppercase sm:tracking-[0.08em]",
              step.state === "upcoming"
                ? "text-muted-foreground"
                : "text-foreground",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
