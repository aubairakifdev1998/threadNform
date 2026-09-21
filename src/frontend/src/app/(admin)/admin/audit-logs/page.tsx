import type { Metadata } from "next";
import { AdminAuditLogsPanel } from "@/components/admin/admin-ops-panels";

export const metadata: Metadata = { title: "Audit logs" };

export default function Page() {
  return <AdminAuditLogsPanel />;
}
