import { cn } from "@/lib/utils";
import { formatDate, orderStatusMeta } from "@/lib/orders/presentation";

export type TimelineEntry = {
  id: string;
  toStatus: string;
  note: string | null;
  actorType?: string;
  visibility?: string;
  createdAt: string;
};

/** Newest first. Admin view tags internal notes. */
export function OrderTimeline({
  entries,
  showVisibility = false,
}: {
  entries: TimelineEntry[];
  showVisibility?: boolean;
}) {
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }
  const ordered = [...entries].reverse();
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {ordered.map((entry, index) => (
        <li key={entry.id} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full border-2 border-background",
              index === 0 ? "bg-primary" : "bg-primary/30",
            )}
          />
          <p className="text-sm font-medium">
            {orderStatusMeta(entry.toStatus).label}
            {showVisibility &&
            entry.visibility &&
            entry.visibility !== "CUSTOMER" ? (
              <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                Internal
              </span>
            ) : null}
          </p>
          {entry.note ? (
            <p className="text-sm text-muted-foreground">{entry.note}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(entry.createdAt, true)}
            {showVisibility && entry.actorType
              ? ` · ${entry.actorType.toLowerCase()}`
              : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
