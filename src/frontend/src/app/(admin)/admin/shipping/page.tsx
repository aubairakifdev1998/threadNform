import type { Metadata } from "next";
import { AdminShippingPanel } from "@/components/admin/admin-ops-panels";

export const metadata: Metadata = { title: "Shipping" };

export default function Page() {
  return <AdminShippingPanel />;
}
