import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { AdminTableShimmer } from "@/components/ui/page-shimmers";

export const metadata: Metadata = { title: "Orders" };

const AdminOrdersPanel = dynamic(
  () =>
    import("@/components/admin/admin-orders-panel").then((mod) => ({
      default: mod.AdminOrdersPanel,
    })),
  { loading: () => <AdminTableShimmer /> },
);

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<AdminTableShimmer />}>
      <AdminOrdersPanel />
    </Suspense>
  );
}
