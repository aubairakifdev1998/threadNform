import type { Metadata } from "next";
import { AdminWarehousesPanel } from "@/components/admin/admin-ops-panels";

export const metadata: Metadata = { title: "Warehouses" };

export default function Page() {
  return <AdminWarehousesPanel />;
}
