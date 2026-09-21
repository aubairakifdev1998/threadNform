import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Attributes" };

/** Fallback if config redirect is skipped. Avoids redirect()-triggered perf error. */
export default function AdminAttributesPage() {
  return (
    <p className="text-sm text-muted-foreground">
      Attributes live under sizes.{" "}
      <Link href="/admin/sizes" className="underline underline-offset-4">
        Go to sizes
      </Link>
    </p>
  );
}
