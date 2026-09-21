"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Ruler,
  Palette,
  FolderTree,
  Boxes,
  ShoppingCart,
  CreditCard,
  Users,
  PanelsTopLeft,
  MessageSquareQuote,
  Settings,
  Store,
  LogOut,
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const ADMIN_NAV = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/billboard", label: "Billboard", icon: PanelsTopLeft },
      { href: "/admin/reviews", label: "Reviews", icon: MessageSquareQuote },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/categories", label: "Categories", icon: FolderTree },
      { href: "/admin/sizes", label: "Sizes", icon: Ruler },
      { href: "/admin/colors", label: "Colors", icon: Palette },
      { href: "/admin/inventory", label: "Inventory", icon: Boxes },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/customers", label: "Customers", icon: Users },
    ],
  },
  {
    label: "System",
    items: [{ href: "/admin/settings", label: "Settings", icon: Settings }],
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
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/admin/dashboard" />}
            >
              <BrandMark className="size-5" />
              <span className="font-display text-base font-semibold">
                Thread N Form
              </span>
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
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar size="sm">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
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
            <SidebarMenuButton render={<Link href="/" />}>
              <Store />
              <span>View storefront</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
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
    </Sidebar>
  );
}
