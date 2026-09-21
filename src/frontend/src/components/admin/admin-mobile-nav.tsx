"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ADMIN_NAV } from "@/components/admin/admin-sidebar";
import { cn } from "@/lib/utils";

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label="Open admin menu"
          />
        }
      >
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100%,18rem)] p-0">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="font-display text-xl">
            Thread N Form Admin
          </SheetTitle>
        </SheetHeader>
        <nav className="space-y-4 overflow-y-auto p-3">
          {ADMIN_NAV.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-3 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </p>
              {group.items.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm",
                    pathname.startsWith(link.href)
                      ? "bg-muted font-medium"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
