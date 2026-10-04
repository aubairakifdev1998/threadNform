"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type BrowseTileItem = {
  href: string;
  label: string;
  caption: string;
  imageUrl?: string | null;
};

function usableImageUrl(url?: string | null) {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url, "http://localhost");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url.trim();
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * One tile language for departments and categories — image or not, the
 * typography and hover motion stay identical.
 */
export function BrowseTile({
  item,
  size = "md",
  className,
}: {
  item: BrowseTileItem;
  size?: "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const imageUrl = !failed ? usableImageUrl(item.imageUrl) : null;
  const tall = size === "lg";

  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex flex-col justify-end overflow-hidden border border-border bg-secondary shadow-e1 transition duration-500",
        "hover:border-foreground/30 hover:shadow-e3",
        tall ? "min-h-56 sm:min-h-72" : "min-h-44 sm:min-h-52",
        className,
      )}
    >
      {imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/10"
            aria-hidden
          />
        </>
      ) : (
        <div
          className="surface-grain absolute inset-0 opacity-80 transition group-hover:opacity-100"
          aria-hidden
        />
      )}

      <div className="relative z-10 flex flex-col gap-2 p-5 sm:p-7">
        <span
          className={cn(
            "label-eyebrow",
            imageUrl ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {item.caption}
        </span>
        <span
          className={cn(
            "heading-display text-2xl leading-[1.05] tracking-tight transition-transform duration-500 group-hover:translate-x-1 sm:text-3xl",
            imageUrl ? "text-white" : "text-foreground",
          )}
        >
          {item.label}
        </span>
        <span
          className={cn(
            "mt-1 text-xs font-medium tracking-wide transition-opacity duration-300",
            imageUrl
              ? "text-white/80 opacity-80 group-hover:opacity-100"
              : "text-muted-foreground opacity-0 group-hover:opacity-100",
          )}
        >
          Explore →
        </span>
      </div>
    </Link>
  );
}

export function BrowseTileGrid({
  items,
  size = "md",
  className,
}: {
  items: BrowseTileItem[];
  size?: "md" | "lg";
  className?: string;
}) {
  if (items.length === 0) return null;
  const cols =
    items.length === 1
      ? "grid-cols-1"
      : items.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={cn("grid gap-3 sm:gap-4", cols, className)}>
      {items.map((item) => (
        <BrowseTile
          key={`${item.href}-${item.label}`}
          item={item}
          size={size}
        />
      ))}
    </div>
  );
}
