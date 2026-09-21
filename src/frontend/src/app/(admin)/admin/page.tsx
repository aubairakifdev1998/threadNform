import type { Metadata } from "next";
import { AdminDashboardPanel } from "@/components/admin/admin-dashboard-panel";

export const metadata: Metadata = {
  title: "Admin",
};

/** Render dashboard directly — avoid page-level redirect() (Turbopack perf bug). */
export default function AdminIndexPage() {
  return <AdminDashboardPanel />;
}
