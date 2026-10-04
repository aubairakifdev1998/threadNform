/**
 * Single source of truth for turning a backend enum into something a human can
 * read, plus the tone that state should be shown in. Order and payment states
 * live in `lib/orders/presentation` because they also drive the order tracker;
 * everything else lives here. Import statuses from this module.
 */

export type { Tone, Meta } from "@/lib/orders/presentation";
export {
  orderStatusMeta,
  paymentStatusMeta,
  PAID_STATUSES,
  progressSteps,
  customerNextStep,
  formatDate,
} from "@/lib/orders/presentation";

import type { Meta } from "@/lib/orders/presentation";

const humanise = (code: string) =>
  code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ");

const fallback = (value?: string | null): Meta => ({
  label: value ? humanise(value) : "—",
  tone: "neutral",
});

/**
 * Product lifecycle. Draft and inactive are both "not for sale" but for
 * different reasons, so they are not collapsed into one state.
 */
const PRODUCT: Record<string, Meta> = {
  ACTIVE: { label: "Active", tone: "success" },
  DRAFT: { label: "Draft", tone: "neutral" },
  INACTIVE: { label: "Inactive", tone: "warning" },
  ARCHIVED: { label: "Archived", tone: "danger" },
};

export function productStatusMeta(status?: string | null): Meta {
  return PRODUCT[status ?? ""] ?? fallback(status);
}

const CUSTOMER: Record<string, Meta> = {
  ACTIVE: { label: "Active", tone: "success" },
  BLOCKED: { label: "Blocked", tone: "danger" },
  INVITED: { label: "Invited", tone: "info" },
};

export function customerStatusMeta(status?: string | null): Meta {
  return CUSTOMER[status ?? ""] ?? fallback(status);
}

/** Below this, a variant is flagged for restocking in the admin UI. */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * Stock level as a state, not a colour. The label always names the condition
 * so the meaning survives for anyone who can't see the tone.
 */
export function stockMeta(available?: number | null): Meta {
  if (available == null) return { label: "Not tracked", tone: "neutral" };
  if (available <= 0) return { label: "Out of stock", tone: "danger" };
  if (available <= LOW_STOCK_THRESHOLD)
    return { label: `Low stock · ${available}`, tone: "warning" };
  return { label: `In stock · ${available}`, tone: "success" };
}

/** Whether customer-facing content (reviews, billboards) is live. */
export function publishMeta(isPublished?: boolean | null): Meta {
  return isPublished
    ? { label: "Published", tone: "success" }
    : { label: "Hidden", tone: "neutral" };
}

/** Whether an operational record (bank account, warehouse) is in use. */
export function activeMeta(isActive?: boolean | null): Meta {
  return isActive
    ? { label: "Active", tone: "success" }
    : { label: "Inactive", tone: "neutral" };
}

const SHIPPING: Record<string, Meta> = {
  NOT_SHIPPED: { label: "Not shipped", tone: "neutral" },
  PENDING: { label: "Not shipped", tone: "neutral" },
  READY: { label: "Ready to ship", tone: "info" },
  PARTIALLY_SHIPPED: { label: "Partly shipped", tone: "info" },
  SHIPPED: { label: "Shipped", tone: "success" },
  IN_TRANSIT: { label: "In transit", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "success" },
  RETURNED: { label: "Returned", tone: "neutral" },
};

export function shippingStatusMeta(status?: string | null): Meta {
  return SHIPPING[status ?? ""] ?? fallback(status);
}
