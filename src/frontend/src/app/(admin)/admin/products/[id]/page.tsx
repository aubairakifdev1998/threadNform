import type { Metadata } from "next";
import { AdminProductEditPanel } from "@/components/admin/admin-product-edit-panel";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Product ${id}` };
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  return <AdminProductEditPanel productId={id} />;
}
