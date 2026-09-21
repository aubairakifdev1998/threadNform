"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BrandMark } from "@/components/layout/brand-mark";
import { useAuth } from "@/components/auth/auth-provider";
import { BRAND } from "@/lib/brand";

type NavLink = { href: string; label: string };

export function MobileNavigation({ links }: { links: NavLink[] }) {
  const { isLoggedIn, loading } = useAuth();

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100%,20rem)]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BrandMark className="size-5" />
            <span className="brand-wordmark text-xl">{BRAND.name}</span>
          </SheetTitle>
        </SheetHeader>
        <nav className="mt-8 flex flex-col gap-4 px-4" aria-label="Mobile">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-base font-medium uppercase tracking-[0.12em] text-foreground transition-colors hover:text-muted-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/account"
            className="text-base uppercase tracking-[0.12em] text-muted-foreground"
          >
            Account
          </Link>
          {!loading && !isLoggedIn ? (
            <>
              <Link
                href="/login"
                className="text-base uppercase tracking-[0.12em] text-muted-foreground"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="text-base uppercase tracking-[0.12em] text-muted-foreground"
              >
                Register
              </Link>
            </>
          ) : null}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
