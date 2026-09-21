import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function Spinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export function PageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4">
      <Loader2 className="size-6 animate-spin text-foreground/70" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function ProductGridShimmer({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4"
      aria-busy="true"
      aria-label="Loading products"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-[3/4] w-full rounded-none" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function ShopPageShimmer() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading catalogue">
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <div className="flex items-end justify-between gap-4">
          <Skeleton className="h-12 w-48 sm:h-14 sm:w-64" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <Skeleton className="h-11 flex-1 rounded-full" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-16 rounded-full" />
        </div>
      </div>
      <ProductGridShimmer />
    </div>
  );
}

export function ProductDetailShimmer() {
  return (
    <div
      className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:px-8 lg:py-14"
      aria-busy="true"
      aria-label="Loading product"
    >
      <Skeleton className="aspect-[3/4] w-full rounded-none" />
      <div className="space-y-5 border border-border p-6 sm:p-8">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-16 w-full" />
        <div className="flex gap-2">
          <Skeleton className="size-10" />
          <Skeleton className="size-10" />
          <Skeleton className="size-10" />
        </div>
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

export function CartShimmer() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-6 px-4 py-16 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading bag"
    >
      <Skeleton className="h-10 w-40" />
      <div className="space-y-0 border border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 last:border-b-0"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-36" />
      </div>
    </div>
  );
}

export function CheckoutShimmer() {
  return (
    <div
      className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_340px] lg:gap-16 lg:px-8 lg:py-14"
      aria-busy="true"
      aria-label="Loading checkout"
    >
      <div className="space-y-8">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-12 w-56" />
        <div className="flex gap-6 border-b border-border pb-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </div>
      <div className="space-y-4 border border-border p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

export function AccountShimmer() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-8 px-4 py-16 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading account"
    >
      <div className="flex justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-24" />
        <div className="border border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex justify-between border-b border-border px-4 py-4 last:border-b-0"
            >
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OrderShimmer() {
  return (
    <div
      className="mx-auto max-w-2xl space-y-6 px-4 py-16 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading order"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function AuthCallbackShimmer() {
  return (
    <div
      className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-5 px-4 text-center"
      aria-busy="true"
      aria-label="Finishing sign-in"
    >
      <Skeleton className="h-8 w-48" />
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

export function AdminTableShimmer({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden border border-border" aria-busy="true">
      <div className="flex gap-4 border-b border-border bg-secondary/40 px-4 py-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ml-auto h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

export function AdminDashboardShimmer() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 border border-border p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 border border-border p-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminGateShimmer() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <Loader2 className="size-6 animate-spin text-foreground/70" aria-hidden />
      <p className="text-sm text-muted-foreground">Checking admin access…</p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3 self-center" />
      </div>
    </div>
  );
}

export function ListBlockShimmer({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-border border border-border" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center justify-between px-4 py-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-14" />
        </li>
      ))}
    </ul>
  );
}
