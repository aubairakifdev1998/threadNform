import type { Metadata } from "next";
import { AdminDepartmentsPanel } from "@/components/admin/admin-departments-panel";

export const metadata: Metadata = { title: "Departments" };

export default function AdminDepartmentsPage() {
  return <AdminDepartmentsPanel />;
}
