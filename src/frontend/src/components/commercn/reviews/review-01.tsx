"use client";

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Quote } from "lucide-react";
import type { CustomerReview } from "@/types/api";
import { cn } from "@/lib/utils";

/** CommerCN review-01, wired to Fareya customer reviews. */
export function ReviewOne({
  review,
  className,
}: {
  review: CustomerReview;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "w-full border-border/80 p-0 shadow-none",
        className,
      )}
    >
      <CardContent className="space-y-5 p-6">
        <Quote className="size-7 text-muted-foreground/40" aria-hidden />

        {review.title ? (
          <h3 className="text-base font-semibold tracking-tight">
            {review.title}
          </h3>
        ) : null}

        <p className="text-base leading-relaxed text-foreground/90">
          {review.body}
        </p>

        <div
          className="flex items-center gap-1 text-sm"
          aria-label={`${review.rating} out of 5`}
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <span
              key={index}
              className={
                index < review.rating
                  ? "text-foreground"
                  : "text-border"
              }
            >
              ★
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          {review.imageUrl ? (
            <div className="relative size-12 overflow-hidden rounded-full bg-secondary">
              <Image
                src={review.imageUrl}
                alt=""
                fill
                className="object-cover"
                sizes="48px"
              />
            </div>
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-sm font-medium">
              {review.customerName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h4 className="text-sm font-semibold">{review.customerName}</h4>
            {review.location ? (
              <p className="text-xs text-muted-foreground">{review.location}</p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
