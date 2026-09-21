import * as React from "react";
import { cn } from "@/lib/utils";

/** Native select styled for admin forms — avoids Base UI controlled/value edge cases. */
export const AdminSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      data-slot="admin-select"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
AdminSelect.displayName = "AdminSelect";
