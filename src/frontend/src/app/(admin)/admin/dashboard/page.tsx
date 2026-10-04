import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { AdminDashboardShimmer } from "@/components/ui/page-shimmers";

export const metadata: Metadata = {
  title: "Admin dashboard",
};

const AdminDashboardPanel = dynamic(
  () =>
    import("@/components/admin/admin-dashboard-panel").then((mod) => ({
      default: mod.AdminDashboardPanel,
    })),
  { loading: () => <AdminDashboardShimmer /> },
);

export default function AdminDashboardPage() {
  return <AdminDashboardPanel />;
}
