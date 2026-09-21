import type { Metadata } from "next";
import { AdminPaymentsPanel } from "@/components/admin/admin-payments-panel";

export const metadata: Metadata = { title: "Payments" };

export default function AdminPaymentsPage() {
  return <AdminPaymentsPanel />;
}
