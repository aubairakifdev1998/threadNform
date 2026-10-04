"use client";

import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  Inbox,
  Lock,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Empty, error and permission states. These exist as one component each so a
 * failed request can never again be rendered as "no results" — a distinction
 * that previously made outages look like an empty catalogue.
 */

function StateShell({
  icon: Icon,
  tone = "neutral",
  title,
  description,
  action,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: "neutral" | "danger";
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 items-center justify-center rounded-full border",
          tone === "danger"
            ? "border-brand/30 bg-brand/10 text-brand"
            : "border-border bg-secondary text-foreground",
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/** Nothing here yet, and that is a valid outcome. Always offer a next step. */
export function EmptyState({
  icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      icon={icon}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}

type ErrorShape = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  recoverable: boolean;
};

/** Turns a thrown value into something worth reading. */
export function describeError(error: unknown, fallback?: string): ErrorShape {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return {
        icon: WifiOff,
        title: "No connection",
        description:
          "We couldn't reach the server. Check your connection and try again.",
        recoverable: true,
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        icon: Lock,
        title:
          error.status === 401 ? "Your session has expired" : "No access",
        description:
          error.status === 401
            ? "Sign in again to continue."
            : error.message ||
              "You don't have permission to view this. Ask an owner to update your role.",
        recoverable: false,
      };
    }
    if (error.status === 404) {
      return {
        icon: AlertTriangle,
        title: "Not found",
        description: error.message || "This record no longer exists.",
        recoverable: false,
      };
    }
    return {
      icon: AlertTriangle,
      title: "Something went wrong",
      description: error.message || fallback || "Please try again.",
      recoverable: true,
    };
  }

  return {
    icon: AlertTriangle,
    title: "Something went wrong",
    description:
      fallback ?? "We couldn't load this right now. Please try again.",
    recoverable: true,
  };
}

/**
 * A failed load. `onRetry` is wired to the query's refetch so the user can
 * recover in place rather than reloading the page.
 */
export function ErrorState({
  error,
  title,
  description,
  onRetry,
  retryLabel = "Try again",
  action,
  className,
}: {
  error?: unknown;
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
}) {
  const shape = describeError(error);
  return (
    <StateShell
      icon={shape.icon}
      tone="danger"
      title={title ?? shape.title}
      description={description ?? shape.description}
      className={className}
      action={
        action ??
        (onRetry && shape.recoverable ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden />
            {retryLabel}
          </Button>
        ) : null)
      }
    />
  );
}

/** The user is signed in but this area isn't theirs. */
export function PermissionState({
  title = "No access",
  description = "You don't have permission to view this area. Ask an owner to update your role.",
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      icon={Lock}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}
