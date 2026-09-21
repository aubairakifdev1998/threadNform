import type { Metadata } from "next";
import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <AdminSettingsPanel />;
}
