"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Store } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ADMIN_NAV } from "@/components/admin/admin-sidebar";

/**
 * Keyboard-first navigation for the admin. With ~16 screens behind an
 * off-canvas sidebar, jumping to one shouldn't take three clicks.
 */
export function AdminCommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
      >
        <Search aria-hidden />
        <span className="hidden sm:inline">Jump to…</span>
        <CommandShortcut className="hidden sm:inline">⌘K</CommandShortcut>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-1/4 translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <Command label="Admin navigation">
            <CommandInput placeholder="Search screens…" autoFocus />
            <CommandList>
              <CommandEmpty>No screens match that search.</CommandEmpty>
              {ADMIN_NAV.map((group) => (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.href}
                        value={`${group.label} ${item.label}`}
                        onSelect={() => go(item.href)}
                      >
                        <Icon aria-hidden />
                        {item.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
              <CommandSeparator />
              <CommandGroup heading="Elsewhere">
                <CommandItem value="storefront" onSelect={() => go("/")}>
                  <Store aria-hidden />
                  View the storefront
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
