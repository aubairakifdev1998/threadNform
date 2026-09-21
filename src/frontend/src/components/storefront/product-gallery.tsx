"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { ProductMedia } from "@/types/api";

export function ProductGallery({
  media,
  productName,
}: {
  media: ProductMedia[];
  productName: string;
}) {
  const images = media.length
    ? media
    : [{ id: "placeholder", url: "", alt: productName }];
  const [activeId, setActiveId] = useState(images[0]?.id);

  const active = images.find((item) => item.id === activeId) ?? images[0];

  return (
    <div className="grid gap-3 lg:grid-cols-[72px_minmax(0,1fr)]">
      {images.length > 1 ? (
        <div className="order-2 flex gap-2 overflow-x-auto lg:order-1 lg:flex-col lg:overflow-visible">
          {images.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className={cn(
                "relative aspect-square w-16 shrink-0 overflow-hidden bg-secondary ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-full",
                activeId === item.id
                  ? "ring-2 ring-foreground"
                  : "opacity-80 hover:opacity-100",
              )}
              aria-label={`View image ${item.alt || productName}`}
            >
              {item.url ? (
                <Image
                  src={item.url}
                  alt=""
                  fill
                  sizes="72px"
                  className="object-cover"
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative order-1 aspect-[3/4] overflow-hidden bg-secondary lg:order-2">
        {active?.url ? (
          <Image
            src={active.url}
            alt={active.alt || productName}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Image coming soon
          </div>
        )}
      </div>
    </div>
  );
}
