import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Collections" };

export default function AdminCollectionsPage() {
  return (
    <p className="text-sm text-muted-foreground">
      Collections are managed with categories for now.{" "}
      <Link href="/admin/categories" className="underline underline-offset-4">
        Go to categories
      </Link>
    </p>
  );
}
