import Image from "next/image";
import type { CustomerReview } from "@/types/api";

export function ReviewsSection({ reviews }: { reviews: CustomerReview[] }) {
  if (!reviews.length) {
    return null;
  }

  return (
    <section className="border-y border-border bg-background py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
            Reviews
          </p>
          <h2 className="heading-display mt-2 text-[clamp(1.75rem,7vw,3rem)] leading-[1.05] sm:text-4xl md:text-5xl">
            Worn & reviewed
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Real customer notes curated by the Thread N Form team.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <article
              key={review.id}
              className="flex flex-col border border-border bg-secondary/30 p-5"
            >
              {review.imageUrl ? (
                <div className="relative mb-4 aspect-[4/3] overflow-hidden bg-muted">
                  <Image
                    src={review.imageUrl}
                    alt={review.title || `${review.customerName} review`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
              ) : null}
              <div className="flex items-center gap-1 text-sm" aria-label={`${review.rating} out of 5`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={
                      i < review.rating ? "text-foreground" : "text-border"
                    }
                  >
                    ★
                  </span>
                ))}
              </div>
              {review.title ? (
                <h3 className="mt-3 text-base font-semibold">{review.title}</h3>
              ) : null}
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {review.body}
              </p>
              <div className="mt-4 border-t border-border pt-3 text-sm">
                <p className="font-medium">{review.customerName}</p>
                {review.location ? (
                  <p className="text-xs text-muted-foreground">{review.location}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
