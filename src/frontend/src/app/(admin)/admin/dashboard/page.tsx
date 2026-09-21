import type { Metadata } from "next";
import { AdminDashboardPanel } from "@/components/admin/admin-dashboard-panel";

export const metadata: Metadata = {
  title: "Admin dashboard",
};

export default function AdminDashboardPage() {
  return <AdminDashboardPanel />;
}
