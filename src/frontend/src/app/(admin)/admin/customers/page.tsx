import type { Metadata } from "next";
import { AdminCustomersPanel } from "@/components/admin/admin-customers-panel";

export const metadata: Metadata = { title: "Customers" };

export default function AdminCustomersPage() {
  return <AdminCustomersPanel />;
}
