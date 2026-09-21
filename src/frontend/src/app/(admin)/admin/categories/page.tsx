import type { Metadata } from "next";
import { AdminCategoriesPanel } from "@/components/admin/admin-categories-panel";

export const metadata: Metadata = { title: "Categories" };

export default function AdminCategoriesPage() {
  return <AdminCategoriesPanel />;
}
