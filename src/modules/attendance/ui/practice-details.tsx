import { CalendarDays, Clock, MapPin } from "lucide-react";
import { formatIsoDate } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/layout";
import { formatTimeRange, type RsvpCounts } from "../domain/practice";

interface PracticeLike {
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  venue: string | null;
  notes: string | null;
  status: string;
}

/** Date, time and venue of a practice, as shown on dashboards. */
export function PracticeDetails({
  practice,
  today,
  className,
}: {
  practice: PracticeLike;
  today: string;
  className?: string;
}) {
  const cancelled = practice.status === "CANCELLED";
  return (
    <div className={cn("space-y-1", className)}>
      <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
        <span className={cn(cancelled && "line-through")}>{practice.title}</span>
        {practice.date === today && !cancelled ? <Badge tone="green">Today</Badge> : null}
        {cancelled ? <Badge tone="red">Cancelled</Badge> : null}
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-4 text-brand-600" aria-hidden="true" />
          {formatIsoDate(practice.date, { weekday: "long", month: "long" })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4 text-brand-600" aria-hidden="true" />
          {formatTimeRange(practice.startTime, practice.endTime)}
        </span>
        {practice.venue ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-brand-600" aria-hidden="true" />
            {practice.venue}
          </span>
        ) : null}
      </p>
      {practice.notes ? <p className="text-sm text-slate-500">{practice.notes}</p> : null}
    </div>
  );
}

export function RsvpCountBadges({ counts }: { counts: RsvpCounts }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5" aria-label="Replies">
      <Badge tone="green">✓ {counts.going} going</Badge>
      <Badge tone="red">✗ {counts.notGoing} can&apos;t</Badge>
      <Badge>? {counts.noResponse} no reply</Badge>
    </span>
  );
}
