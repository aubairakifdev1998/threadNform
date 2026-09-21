import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminOrdersPanel } from "@/components/admin/admin-orders-panel";
import { AdminTableShimmer } from "@/components/ui/page-shimmers";

export const metadata: Metadata = { title: "Orders" };

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<AdminTableShimmer />}>
      <AdminOrdersPanel />
    </Suspense>
  );
}
