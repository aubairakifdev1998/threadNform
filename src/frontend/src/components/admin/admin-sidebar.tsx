"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Ruler,
  Palette,
  FolderTree,
  Layers,
  Boxes,
  ShoppingCart,
  CreditCard,
  Users,
  BookOpen,
  PanelsTopLeft,
  MessageSquareQuote,
  Settings,
  Store,
  LogOut,
  Warehouse,
  Truck,
  BarChart3,
  ScrollText,
} from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";
import { useAuth } from "@/components/auth/auth-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/**
 * Grouped by the job being done rather than by data model, so the daily
 * queues (orders, payments) sit together and storefront content isn't filed
 * under "Overview". Every route that exists is reachable from here.
 */
export const ADMIN_NAV = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Selling",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/customers", label: "Customers", icon: Users },
      {
        href: "/admin/customer-diary",
        label: "Customer diary",
        icon: BookOpen,
      },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/departments", label: "Departments", icon: Layers },
      { href: "/admin/categories", label: "Categories", icon: FolderTree },
      { href: "/admin/sizes", label: "Sizes", icon: Ruler },
      { href: "/admin/colors", label: "Colours", icon: Palette },
      { href: "/admin/inventory", label: "Inventory", icon: Boxes },
    ],
  },
  {
    label: "Storefront",
    items: [
      { href: "/admin/billboard", label: "Billboard", icon: PanelsTopLeft },
      { href: "/admin/reviews", label: "Reviews", icon: MessageSquareQuote },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/warehouses", label: "Warehouses", icon: Warehouse },
      { href: "/admin/shipping", label: "Shipping", icon: Truck },
      { href: "/admin/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
    ],
  },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const initials =
    (user?.fullName || user?.email || "A")
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "A";

  return (
    <Sidebar collapsible="icon" variant="inset" className="border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Dashboard"
              render={<Link href="/admin/dashboard" />}
              className="hover:bg-sidebar-accent"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <BrandMark className="size-4 text-current" />
              </span>
              <div className="flex min-w-0 flex-col items-start leading-tight">
                <span className="brand-wordmark text-sm">Thread N Form</span>
                <span className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Admin
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {ADMIN_NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
          <Avatar size="sm">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium">
              {user?.fullName || "Admin"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="View storefront"
              render={<Link href="/" />}
            >
              <Store />
              <span>View storefront</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={() =>
                void signOut().then(() => {
                  window.location.href = "/login";
                })
              }
            >
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
