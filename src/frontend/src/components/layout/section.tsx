import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Storefront page rhythm. Every section picks a named width and spacing step
 * rather than its own `max-w-*` and `py-*`, which is what made the homepage,
 * cart and order pages feel like three different sites.
 */

const WIDTH = {
  /** Catalogue grids, galleries, dashboards. */
  wide: "max-w-7xl",
  /** Mixed content and two-column detail layouts. */
  content: "max-w-5xl",
  /** Single-column transactional flows: cart, account, auth. */
  narrow: "max-w-3xl",
} as const;

const SPACE = {
  none: "",
  tight: "py-8 lg:py-10",
  default: "py-12 lg:py-16",
  loose: "py-16 lg:py-24",
} as const;

export function Section({
  as: Tag = "section",
  width = "wide",
  space = "default",
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  width?: keyof typeof WIDTH;
  space?: keyof typeof SPACE;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentPropsWithoutRef<"section">, "className" | "children">) {
  return (
    <Tag
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        WIDTH[width],
        SPACE[space],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Section heading block. The eyebrow is optional context, the title is the
 * heading proper, and `action` sits inline on desktop so "View all" style
 * links don't need their own row.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  as: Tag = "h2",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: ElementType;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="label-eyebrow text-primary">{eyebrow}</p>
        ) : null}
        <Tag className="heading-display text-2xl sm:text-3xl">{title}</Tag>
        {description ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
