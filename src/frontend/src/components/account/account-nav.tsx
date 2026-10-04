"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  FileText,
  History,
  Package,
  UserRound,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const ACCOUNT_NAV: Array<{
  href: string;
  label: string;
  icon: typeof Package;
  exact?: boolean;
}> = [
  { href: "/account", label: "Overview", icon: UserRound, exact: true },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/payments", label: "Payments", icon: CreditCard },
  { href: "/account/invoices", label: "Invoices", icon: FileText },
  { href: "/account/history", label: "History", icon: History },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
];

export function AccountNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Account"
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-border pb-px sm:flex-col sm:gap-0.5 sm:overflow-visible sm:border-b-0 sm:border-r sm:pr-6",
        className,
      )}
    >
      {ACCOUNT_NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm transition-colors sm:w-full sm:rounded-md",
              active
                ? "border-b-2 border-brand font-medium text-foreground sm:border-b-0 sm:bg-accent sm:text-accent-foreground"
                : "text-muted-foreground hover:text-foreground sm:hover:bg-secondary/70",
            )}
          >
            <Icon className="size-4 opacity-70" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
