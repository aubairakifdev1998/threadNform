import type { Metadata } from "next";
import { redirect } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " ") };
}

/** Collections are retired — send old links to the shop. */
export default async function CollectionPage() {
  redirect("/shop");
}
