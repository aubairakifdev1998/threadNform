import type { Metadata } from "next";
import { AdminReportsPanel } from "@/components/admin/admin-ops-panels";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <AdminReportsPanel />;
}
