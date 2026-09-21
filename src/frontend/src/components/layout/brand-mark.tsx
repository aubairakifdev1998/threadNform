import { cn } from "@/lib/utils";

/** Geometric mark inspired by the mockups — two opposing triangles. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("text-foreground", className)}
      aria-hidden
    >
      <path fill="currentColor" d="M4 8 L16 24 L16 14 Z" />
      <path fill="currentColor" d="M28 8 L16 24 L16 14 Z" opacity="0.85" />
    </svg>
  );
}
