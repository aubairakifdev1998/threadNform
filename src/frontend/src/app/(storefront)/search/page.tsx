import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Search",
};

type Props = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const qs = new URLSearchParams();
  if (q?.trim()) qs.set("q", q.trim());
  redirect(qs.toString() ? `/shop?${qs.toString()}` : "/shop");
}
