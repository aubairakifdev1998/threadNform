/** Shared order/payment field mapping (snake_case → camelCase for Drizzle). */

export function normalizeOrderExtra(
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  if (!extra) return {};
  const aliases: Record<string, string> = {
    payment_status: 'paymentStatus',
    shipping_status: 'shippingStatus',
    cancellation_reason: 'cancellationReason',
    tracking_number: 'trackingNumber',
    tracking_url: 'trackingUrl',
  };
  const allowed = new Set([
    'paymentStatus',
    'shippingStatus',
    'cancellationReason',
    'carrier',
    'trackingNumber',
    'trackingUrl',
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    const mapped = aliases[key] ?? key;
    if (allowed.has(mapped)) out[mapped] = value;
  }
  return out;
}

export function normalizePaymentExtra(
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  if (!extra) return {};
  const aliases: Record<string, string> = {
    admin_note: 'adminNote',
    amount_claimed_pence: 'amountClaimedPence',
  };
  const allowed = new Set(['adminNote', 'amountClaimedPence']);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    const mapped = aliases[key] ?? key;
    if (allowed.has(mapped)) out[mapped] = value;
  }
  return out;
}
