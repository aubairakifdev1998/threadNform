"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Row-level actions behind one trigger. Ten rows each showing three buttons
 * turned every admin table into a wall of controls and pushed the data that
 * matters off-screen; the destructive action is also harder to hit by accident.
 */

export type RowAction = {
  label: string;
  icon?: ReactNode;
  /** Renders as a link when set, otherwise as a button. */
  href?: string;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Draws a divider above this item. */
  separated?: boolean;
};

export function RowActions({
  actions,
  label,
}: {
  actions: RowAction[];
  /** Names the record, so the trigger isn't ten identical "More" buttons. */
  label: string;
}) {
  const available = actions.filter(Boolean);
  if (available.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${label}`}
          />
        }
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        {available.map((action) => (
          <div key={action.label} className="contents">
            {action.separated ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={action.destructive ? "destructive" : "default"}
              disabled={action.disabled}
              onClick={action.onSelect}
              render={action.href ? <Link href={action.href} /> : undefined}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
