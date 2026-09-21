import type { Metadata } from "next";
import { AdminSizesPanel } from "@/components/admin/admin-sizes-panel";

export const metadata: Metadata = { title: "Sizes" };

export default function AdminSizesPage() {
  return <AdminSizesPanel />;
}
