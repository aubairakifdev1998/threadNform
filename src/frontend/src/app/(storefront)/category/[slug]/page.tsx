import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { catalogApi } from "@/lib/api";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const filters = await catalogApi.getFilters();
    const category = filters.categories.find((c) => c.slug === slug);
    const department = filters.departments.find((d) => d.slug === slug);
    if (category) return { title: category.name };
    if (department) return { title: department.name };
  } catch {
    // fall through
  }
  return { title: slug.replace(/-/g, " ") };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const filters = await catalogApi.getFilters();
  const category = filters.categories.find((c) => c.slug === slug);
  const department = filters.departments.find((d) => d.slug === slug);

  if (category) {
    redirect(`/shop?categoryId=${category.id}`);
  }
  if (department) {
    redirect(`/shop?departmentId=${department.id}`);
  }

  const alias =
    filters.departments.find(
      (d) =>
        (slug === "womens" && d.slug === "women") ||
        (slug === "mens" && d.slug === "men"),
    ) ?? null;
  if (alias) {
    redirect(`/shop?departmentId=${alias.id}`);
  }

  redirect("/shop");
}
