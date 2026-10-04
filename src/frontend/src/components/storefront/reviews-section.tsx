import { Section, SectionHeader } from "@/components/layout/section";
import { ReviewOne } from "@/components/commercn/reviews/review-01";
import type { CustomerReview } from "@/types/api";

export function ReviewsSection({ reviews }: { reviews: CustomerReview[] }) {
  if (!reviews.length) {
    return null;
  }

  return (
    <section className="border-y border-border bg-background">
      <Section space="loose">
        <SectionHeader
          eyebrow="Reviews"
          title="Worn & reviewed"
          description="Notes from customers who bought and wore the pieces."
        />

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <ReviewOne key={review.id} review={review} />
          ))}
        </div>
      </Section>
    </section>
  );
}
