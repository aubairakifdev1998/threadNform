import { StatusBadge } from "@/components/ui/status-badge";
import {
  activeMeta,
  customerStatusMeta,
  orderStatusMeta,
  paymentStatusMeta,
  productStatusMeta,
  publishMeta,
  shippingStatusMeta,
  stockMeta,
} from "@/lib/status";

/**
 * Domain-bound status badges. Screens render these instead of mapping an enum
 * to a colour themselves, which is how the same state ended up looking
 * different on every table.
 */

type Props = { className?: string };

export function OrderStatusBadge({
  status,
  className,
}: Props & { status?: string | null }) {
  const meta = orderStatusMeta(status);
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {meta.label}
    </StatusBadge>
  );
}

export function PaymentStatusBadge({
  status,
  className,
}: Props & { status?: string | null }) {
  const meta = paymentStatusMeta(status);
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {meta.label}
    </StatusBadge>
  );
}

export function ShippingStatusBadge({
  status,
  className,
}: Props & { status?: string | null }) {
  const meta = shippingStatusMeta(status);
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {meta.label}
    </StatusBadge>
  );
}

export function ProductStatusBadge({
  status,
  className,
}: Props & { status?: string | null }) {
  const meta = productStatusMeta(status);
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {meta.label}
    </StatusBadge>
  );
}

export function CustomerStatusBadge({
  status,
  className,
}: Props & { status?: string | null }) {
  const meta = customerStatusMeta(status);
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {meta.label}
    </StatusBadge>
  );
}

export function StockBadge({
  available,
  className,
}: Props & { available?: number | null }) {
  const meta = stockMeta(available);
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {meta.label}
    </StatusBadge>
  );
}

export function PublishBadge({
  isPublished,
  className,
}: Props & { isPublished?: boolean | null }) {
  const meta = publishMeta(isPublished);
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {meta.label}
    </StatusBadge>
  );
}

export function ActiveBadge({
  isActive,
  className,
}: Props & { isActive?: boolean | null }) {
  const meta = activeMeta(isActive);
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {meta.label}
    </StatusBadge>
  );
}
