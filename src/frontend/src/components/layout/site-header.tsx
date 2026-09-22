"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, Search, ShoppingBag, User } from "lucide-react";
import { motion, useMotionValueEvent, useScroll, useReducedMotion } from "framer-motion";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { BrandMark } from "@/components/layout/brand-mark";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/shop", label: "Shop" },
  { href: "/category/women", label: "Women" },
  { href: "/category/men", label: "Men" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [compact, setCompact] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const prev = scrollY.getPrevious() ?? 0;
    setCompact(latest > 24);
    if (latest > 80 && latest > prev) setHidden(true);
    else setHidden(false);
  });

  useEffect(() => {
    setHidden(false);
  }, [pathname]);

  return (
    <motion.header
      initial={false}
      animate={
        reduceMotion
          ? undefined
          : {
              y: hidden ? -88 : 0,
            }
      }
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-40"
    >
      <div
        className={cn(
          "mx-auto transition-all duration-300",
          compact
            ? "max-w-5xl px-3 pt-2 sm:pt-3"
            : "max-w-7xl px-0 pt-0",
        )}
      >
        <div
          className={cn(
            "relative grid grid-cols-[1fr_auto_1fr] items-center border-border/70 bg-background/85 backdrop-blur-md transition-all duration-300",
            compact
              ? "h-12 rounded-full border px-3 shadow-sm shadow-foreground/5 sm:h-14 sm:px-5"
              : "h-14 border-b px-3 sm:h-16 sm:px-6 lg:px-8",
          )}
        >
          <div className="flex items-center justify-start gap-3 sm:gap-5">
            <MobileNavigation links={navLinks} />
            <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-[0.75rem] font-medium uppercase tracking-[0.14em] transition-colors",
                    pathname === link.href
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <Link
            href="/"
            className="flex max-w-[46vw] items-center justify-center gap-1.5 sm:max-w-none sm:gap-2"
            aria-label={BRAND.name}
          >
            <BrandMark className="size-5 shrink-0 sm:size-6" />
            <span className="brand-wordmark truncate text-[0.85rem] sm:text-lg">
              {BRAND.name}
            </span>
          </Link>

          <div className="flex items-center justify-end gap-0.5 sm:gap-1.5">
            <Link
              href="/search"
              aria-label="Search"
              className="inline-flex size-9 items-center justify-center rounded-full text-foreground transition hover:bg-secondary"
            >
              <Search className="size-4" />
            </Link>
            <Link
              href="/account"
              aria-label="Wishlist"
              className="hidden size-9 items-center justify-center rounded-full text-foreground transition hover:bg-secondary sm:inline-flex"
            >
              <Heart className="size-4" />
            </Link>
            <Link
              href="/cart"
              className="inline-flex size-9 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90 sm:h-9 sm:w-auto sm:gap-2 sm:px-3.5"
              aria-label="Cart"
            >
              <ShoppingBag className="size-3.5" />
              <span className="hidden text-xs font-medium tracking-wide sm:inline">
                Cart
              </span>
            </Link>
            <Link
              href="/account"
              aria-label="Account"
              className="inline-flex size-9 items-center justify-center rounded-full text-foreground transition hover:bg-secondary"
            >
              <User className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
