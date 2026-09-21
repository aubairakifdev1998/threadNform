import type { Metadata } from "next";
import { AdminColorsPanel } from "@/components/admin/admin-colors-panel";

export const metadata: Metadata = { title: "Colors" };

export default function AdminColorsPage() {
  return <AdminColorsPanel />;
}
