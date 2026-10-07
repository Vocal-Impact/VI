import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, MapPin } from "lucide-react";
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

/** Where booking the venue with the IIT administration stands (admins only). */
export function VenueBookingBadge({
  practice,
}: {
  practice: { venueRequestedAt: string | null; venueConfirmedAt: string | null };
}) {
  if (practice.venueConfirmedAt) return <Badge tone="green">Venue confirmed</Badge>;
  if (practice.venueRequestedAt) return <Badge tone="blue">Venue requested</Badge>;
  return <Badge tone="amber">Venue not requested</Badge>;
}

/**
 * Makes a whole practice card open the practice page. Put it inside a
 * `relative` card; buttons and forms in the card need `relative z-10` to stay
 * clickable above it.
 */
export function PracticeCardLink({ practiceId, label }: { practiceId: string; label: string }) {
  return (
    <>
      <Link
        href={`/attendance/${practiceId}`}
        aria-label={`Open ${label}`}
        className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      />
      <ChevronRight
        className="pointer-events-none absolute top-3 right-3 size-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
        aria-hidden="true"
      />
    </>
  );
}
