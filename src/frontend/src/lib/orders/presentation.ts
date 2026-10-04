/**
 * One vocabulary for order / payment states across the storefront and admin:
 * human labels, colour tone, progress-tracker steps and the customer's next
 * step. Keeps raw enum codes out of the UI.
 */

export type Tone = "neutral" | "info" | "warning" | "success" | "danger";

export type Meta = { label: string; tone: Tone };

const ORDER: Record<string, Meta> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "warning" },
  PAYMENT_SUBMITTED: { label: "Payment submitted", tone: "info" },
  PAYMENT_UNDER_REVIEW: { label: "Checking payment", tone: "info" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  PROCESSING: { label: "Preparing", tone: "info" },
  PACKED: { label: "Packed", tone: "info" },
  PARTIALLY_SHIPPED: { label: "Partly shipped", tone: "info" },
  SHIPPED: { label: "Shipped", tone: "success" },
  DELIVERED: { label: "Delivered", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  RETURN_REQUESTED: { label: "Return requested", tone: "warning" },
  RETURNED: { label: "Returned", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

const PAYMENT: Record<string, Meta> = {
  PENDING: { label: "Not paid", tone: "warning" },
  PROOF_SUBMITTED: { label: "Proof received", tone: "info" },
  UNDER_REVIEW: { label: "Under review", tone: "info" },
  VERIFIED: { label: "Paid", tone: "success" },
  PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "neutral" },
  REJECTED: { label: "Proof rejected", tone: "danger" },
  REFUND_PENDING: { label: "Refund due", tone: "warning" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

const humanise = (code: string) =>
  code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ");

export function orderStatusMeta(status?: string | null): Meta {
  return (
    ORDER[status ?? ""] ?? {
      label: status ? humanise(status) : "—",
      tone: "neutral",
    }
  );
}

export function paymentStatusMeta(status?: string | null): Meta {
  return (
    PAYMENT[status ?? ""] ?? {
      label: status ? humanise(status) : "—",
      tone: "neutral",
    }
  );
}

export const PAID_STATUSES = new Set([
  "VERIFIED",
  "PARTIALLY_REFUNDED",
  "REFUND_PENDING",
  "REFUNDED",
]);

export type Step = {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming";
};

const STEP_ORDER = [
  "placed",
  "paid",
  "preparing",
  "shipped",
  "delivered",
] as const;

/** Five-step tracker; null for orders that left the normal path (cancelled). */
export function progressSteps(
  status: string,
  paymentStatus?: string,
): Step[] | null {
  if (status === "CANCELLED") return null;
  const reached: Record<string, number> = {
    PENDING_PAYMENT: 0,
    PAYMENT_SUBMITTED: 0,
    PAYMENT_UNDER_REVIEW: 0,
    CONFIRMED: 2,
    PROCESSING: 2,
    PACKED: 2,
    PARTIALLY_SHIPPED: 3,
    SHIPPED: 3,
    DELIVERED: 4,
    RETURN_REQUESTED: 4,
    RETURNED: 4,
    REFUNDED: 4,
  };
  let current = reached[status] ?? 0;
  if (current < 2 && PAID_STATUSES.has(paymentStatus ?? "")) current = 2;
  const labels: Record<string, string> = {
    placed: "Order placed",
    paid: "Payment confirmed",
    preparing: "Preparing",
    shipped: status === "PARTIALLY_SHIPPED" ? "Partly shipped" : "Shipped",
    delivered: ["RETURN_REQUESTED", "RETURNED", "REFUNDED"].includes(status)
      ? orderStatusMeta(status).label
      : "Delivered",
  };
  const finished = status === "DELIVERED" || current === 4;
  return STEP_ORDER.map((key, index) => ({
    key,
    label: labels[key],
    state:
      index < current || (finished && index === current)
        ? "done"
        : index === current
          ? "current"
          : "upcoming",
  }));
}

export type NextStep = { tone: Tone; title: string; body: string };

/** What the customer should know / do right now. */
export function customerNextStep(order: {
  status: string;
  paymentStatus?: string;
  rejectionNote?: string | null;
}): NextStep {
  const payment = order.paymentStatus ?? "";
  if (order.status === "CANCELLED") {
    return {
      tone: "danger",
      title: "This order was cancelled",
      body:
        payment === "REFUND_PENDING"
          ? "Your payment will be refunded to the account it came from."
          : payment === "REFUNDED"
            ? "Your payment has been refunded."
            : "No payment is needed for this order.",
    };
  }
  if (payment === "REJECTED") {
    return {
      tone: "danger",
      title: "We couldn't confirm your payment",
      body: order.rejectionNote
        ? `${order.rejectionNote}. Please check your transfer and upload a new proof below.`
        : "Please check your transfer and upload a new proof below.",
    };
  }
  if (payment === "PENDING") {
    return {
      tone: "warning",
      title: "Complete your bank transfer",
      body: "Transfer the amount below using your order number as the reference, then upload a screenshot or PDF of the payment.",
    };
  }
  if (payment === "PROOF_SUBMITTED" || payment === "UNDER_REVIEW") {
    return {
      tone: "info",
      title: "We're checking your payment",
      body: "Thanks — we've received your proof of payment. You'll get an email as soon as it's confirmed, usually within one working day.",
    };
  }
  switch (order.status) {
    case "CONFIRMED":
    case "PROCESSING":
    case "PACKED":
      return {
        tone: "success",
        title: "Payment confirmed — we're preparing your order",
        body: "We'll email you tracking details as soon as it ships.",
      };
    case "PARTIALLY_SHIPPED":
      return {
        tone: "info",
        title: "Part of your order is on its way",
        body: "The rest will follow in a separate parcel. Tracking for each parcel is below.",
      };
    case "SHIPPED":
      return {
        tone: "info",
        title: "Your order is on its way",
        body: "Use the tracking details below to follow your delivery.",
      };
    case "DELIVERED":
      return {
        tone: "success",
        title: "Delivered",
        body: "We hope you love it. Contact us if anything isn't right.",
      };
    case "RETURN_REQUESTED":
      return {
        tone: "warning",
        title: "Return requested",
        body: "We'll be in touch with return instructions.",
      };
    case "RETURNED":
      return {
        tone: "neutral",
        title: "Return received",
        body: "We're processing your refund.",
      };
    case "REFUNDED":
      return {
        tone: "neutral",
        title: "Refunded",
        body: "Your refund has been sent to the account you paid from.",
      };
    default:
      return {
        tone: "neutral",
        title: orderStatusMeta(order.status).label,
        body: "",
      };
  }
}

export function formatDate(value?: string | Date | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
