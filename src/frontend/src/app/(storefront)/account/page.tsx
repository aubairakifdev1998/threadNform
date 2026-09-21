import type { Metadata } from "next";
import { AccountPanel } from "@/components/layout/account-panel";

export const metadata: Metadata = {
  title: "Account",
};

export default function AccountPage() {
  return <AccountPanel />;
}
