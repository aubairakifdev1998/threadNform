import type { Metadata } from "next";
import { AdminProductsPanel } from "@/components/admin/admin-products-panel";

export const metadata: Metadata = { title: "Products" };

export default function AdminProductsPage() {
  return <AdminProductsPanel />;
}
