"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

/**
 * Global Sonner host — black/white + brand accent, top-right, consistent
 * across admin and storefront.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-right"
      closeButton
      expand={false}
      visibleToasts={4}
      gap={10}
      offset={16}
      duration={4200}
      icons={{
        success: <CircleCheckIcon className="size-4 text-foreground" />,
        info: <InfoIcon className="size-4 text-muted-foreground" />,
        warning: <TriangleAlertIcon className="size-4 text-brand" />,
        error: <OctagonXIcon className="size-4 text-brand" />,
        loading: (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast border border-border bg-popover text-popover-foreground shadow-e3",
          title: "text-sm font-medium text-foreground",
          description: "text-sm text-muted-foreground",
          actionButton:
            "bg-primary text-primary-foreground hover:bg-primary/90",
          cancelButton: "bg-secondary text-secondary-foreground",
          closeButton:
            "border-border bg-background text-foreground hover:bg-secondary",
          success: "border-foreground/15",
          error: "border-brand/35",
          warning: "border-brand/25",
          info: "border-border",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--success-bg": "var(--popover)",
          "--error-bg": "var(--popover)",
          "--warning-bg": "var(--popover)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
