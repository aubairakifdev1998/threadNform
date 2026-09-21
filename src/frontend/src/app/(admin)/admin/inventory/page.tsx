import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminInventoryPanel } from "@/components/admin/admin-inventory-panel";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";

export const metadata: Metadata = { title: "Inventory" };

export default function AdminInventoryPage() {
  return (
    <Suspense fallback={<ListBlockShimmer />}>
      <AdminInventoryPanel />
    </Suspense>
  );
}
