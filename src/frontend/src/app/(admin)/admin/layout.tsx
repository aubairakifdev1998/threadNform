"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminGate } from "@/components/admin/admin-gate";
import { AdminSidebar, ADMIN_NAV } from "@/components/admin/admin-sidebar";
import { AdminCommandMenu } from "@/components/admin/admin-command-menu";
import { PageTransition } from "@/components/motion/page-transition";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** Known routes, so a crumb reads "Products" rather than "products". */
const NAV_TITLES = new Map<string, string>(
  ADMIN_NAV.flatMap((group) =>
    group.items.map((item) => [item.href as string, item.label as string]),
  ),
);

const SEGMENT_TITLES: Record<string, string> = {
  admin: "Admin",
  new: "New",
  dashboard: "Dashboard",
  "audit-logs": "Audit logs",
  colors: "Colours",
  departments: "Departments",
};

const titleCase = (segment: string) =>
  segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type Crumb = { label: string; href?: string };

/**
 * Builds the trail from the path. Dynamic segments (a product id) are the one
 * case the URL can't name, so they become "Edit" rather than leaking a UUID.
 */
function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];

  segments.forEach((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const isLast = index === segments.length - 1;

    // An opaque id: label by what the screen does, not by the identifier.
    const looksLikeId = /^[0-9a-f]{8}-|^[0-9a-f]{12,}$|^\d+$/i.test(segment);

    const label = looksLikeId
      ? "Edit"
      : (NAV_TITLES.get(href) ??
        SEGMENT_TITLES[segment] ??
        titleCase(segment));

    crumbs.push({ label, href: isLast ? undefined : href });
  });

  return crumbs;
}

function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <SidebarProvider defaultOpen>
      <AdminSidebar />
      <SidebarInset className="bg-secondary/40">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
          <SidebarTrigger
            className="-ml-1"
            aria-label="Toggle sidebar"
            title="Toggle sidebar (⌘B)"
          />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {crumbs.map((crumb, index) => (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 ? (
                    <BreadcrumbSeparator className="hidden sm:block" />
                  ) : null}
                  <BreadcrumbItem
                    className={
                      index === crumbs.length - 1 ? "" : "hidden sm:block"
                    }
                  >
                    {crumb.href ? (
                      <BreadcrumbLink render={<Link href={crumb.href} />}>
                        {crumb.label}
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="truncate font-medium">
                        {crumb.label}
                      </BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <AdminCommandMenu />
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <PageTransition className="mx-auto w-full max-w-7xl">
            {children}
          </PageTransition>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGate>
      <AdminChrome>{children}</AdminChrome>
    </AdminGate>
  );
}
