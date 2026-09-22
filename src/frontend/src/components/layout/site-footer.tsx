"use client";

import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { useAuth } from "@/components/auth/auth-provider";
import { BRAND } from "@/lib/brand";

export function SiteFooter() {
  const { isLoggedIn, user } = useAuth();

  const companyLinks = isLoggedIn
    ? [
        { href: "/account", label: "My account" },
        ...(user?.isAdmin
          ? [{ href: "/admin/dashboard", label: "Admin" }]
          : []),
      ]
    : [
        { href: "/login", label: "Sign in" },
        { href: "/register", label: "Register" },
      ];

  const footerLinks = [
    {
      title: "Shop",
      links: [
        { href: "/shop", label: "All products" },
        { href: "/category/women", label: "Women" },
        { href: "/category/men", label: "Men" },
      ],
    },
    {
      title: "Help",
      links: [
        { href: "/account", label: "My account" },
        { href: "/cart", label: "Cart" },
        { href: "/checkout", label: "Checkout" },
      ],
    },
    {
      title: "Company",
      links: companyLinks,
    },
  ];

  return (
    <footer className="mt-auto border-t border-border bg-secondary/50">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2.5">
            <BrandMark className="size-7" />
            <p className="brand-wordmark text-xl sm:text-2xl">{BRAND.name}</p>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {BRAND.tagline}
          </p>
        </div>
        {footerLinks.map((group) => (
          <div key={group.title}>
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {group.title}
            </p>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={`${group.title}-${link.href}-${link.label}`}>
                  <Link
                    href={link.href}
                    className="text-sm text-foreground/75 transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {BRAND.legalName}. All rights reserved.
          </p>
          <p>{BRAND.currencyNote}</p>
        </div>
      </div>
    </footer>
  );
}
