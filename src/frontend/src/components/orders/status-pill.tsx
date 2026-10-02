import { cn } from "@/lib/utils";
import {
  orderStatusMeta,
  paymentStatusMeta,
  type Tone,
} from "@/lib/orders/presentation";

const TONE: Record<Tone, string> = {
  neutral: "border-border bg-secondary text-foreground",
  info: "border-info/30 bg-info/10 text-info",
  warning:
    "border-warning/40 bg-warning/10 text-[color-mix(in_oklch,var(--warning),black_25%)] dark:text-warning",
  success: "border-success/30 bg-success/10 text-success",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function TonePill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function OrderStatusPill({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  const meta = orderStatusMeta(status);
  return (
    <TonePill tone={meta.tone} className={className}>
      {meta.label}
    </TonePill>
  );
}

export function PaymentStatusPill({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  const meta = paymentStatusMeta(status);
  return (
    <TonePill tone={meta.tone} className={className}>
      {meta.label}
    </TonePill>
  );
}

export const TONE_PANEL: Record<Tone, string> = {
  neutral: "border-border bg-secondary/50",
  info: "border-info/30 bg-info/5",
  warning: "border-warning/40 bg-warning/10",
  success: "border-success/30 bg-success/5",
  danger: "border-destructive/30 bg-destructive/5",
};
