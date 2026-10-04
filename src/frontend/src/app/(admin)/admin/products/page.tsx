import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { AdminTableShimmer } from "@/components/ui/page-shimmers";

export const metadata: Metadata = { title: "Products" };

const AdminProductsPanel = dynamic(
  () =>
    import("@/components/admin/admin-products-panel").then((mod) => ({
      default: mod.AdminProductsPanel,
    })),
  { loading: () => <AdminTableShimmer /> },
);

/** CSR island: interactive table; metadata stays SSR for the tab title. */
export default function AdminProductsPage() {
  return <AdminProductsPanel />;
}
