"use client";

import {
  isValidElement,
  type ComponentType,
  type ReactNode,
} from "react";
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

/** Prefer a rendered node from Server Components; component refs stay OK in client trees. */
export type StateIcon = ReactNode | ComponentType<{ className?: string }>;

function isComponentType(
  value: unknown,
): value is ComponentType<{ className?: string }> {
  if (typeof value === "function") return true;
  if (typeof value !== "object" || value === null) return false;
  // lucide / forwardRef / memo exotic components
  return "$$typeof" in value && "render" in value;
}

function resolveStateIcon(
  icon: StateIcon | undefined,
  Fallback: ComponentType<{ className?: string }>,
): ReactNode {
  if (icon == null) return <Fallback className="size-4.5" />;
  if (isValidElement(icon)) return icon;
  if (
    typeof icon === "string" ||
    typeof icon === "number" ||
    typeof icon === "bigint" ||
    typeof icon === "boolean"
  ) {
    return icon;
  }
  if (isComponentType(icon)) {
    const Icon = icon;
    return <Icon className="size-4.5" />;
  }
  return <Fallback className="size-4.5" />;
}

function StateShell({
  icon,
  tone = "neutral",
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
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
        {icon}
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
  icon,
  title,
  description,
  action,
  className,
}: {
  /** Pass JSX (`<Icon />`) from Server Components — bare component refs cannot cross the RSC boundary. */
  icon?: StateIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      icon={resolveStateIcon(icon, Inbox)}
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
      icon={resolveStateIcon(shape.icon, AlertTriangle)}
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
      icon={resolveStateIcon(undefined, Lock)}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}
