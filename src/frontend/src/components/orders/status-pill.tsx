/**
 * Kept so existing order screens keep working after the status chip moved into
 * the design system. New code should import from `@/components/status/*` and
 * `@/components/ui/status-badge`.
 */
export {
  StatusBadge as TonePill,
  TONE_SURFACE as TONE_PANEL,
} from "@/components/ui/status-badge";
export {
  OrderStatusBadge as OrderStatusPill,
  PaymentStatusBadge as PaymentStatusPill,
} from "@/components/status/status-badges";
