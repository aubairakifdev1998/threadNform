import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { AdminTableShimmer } from "@/components/ui/page-shimmers";

export const metadata: Metadata = { title: "Customer diary" };

const AdminCustomerDiaryPanel = dynamic(
  () =>
    import("@/components/admin/admin-customer-diary-panel").then((mod) => ({
      default: mod.AdminCustomerDiaryPanel,
    })),
  { loading: () => <AdminTableShimmer rows={8} /> },
);

export default function AdminCustomerDiaryPage() {
  return <AdminCustomerDiaryPanel />;
}
