import { getMemberRsvps, listUpcomingPractices } from "@/modules/attendance";
import { canRsvp, type PracticeAudience } from "@/modules/attendance/domain";
import { PracticeCardLink, PracticeDetails, RsvpCountBadges, VenueBookingBadge } from "@/modules/attendance/ui";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate } from "@/shared/lib/dates";
import { LinkButton } from "@/shared/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/shared/ui/layout";
import { RsvpButtons } from "./attendance/rsvp-buttons";

/**
 * Upcoming practices on the dashboard. People who may reply (choir members to
 * choir practices, alumni to alumni practices) get Going / Can't make it;
 * organisers also see reply counts and can edit or take attendance.
 */
export async function UpcomingPractices({
  memberId,
  manage,
  showVenueBooking = false,
  take = 4,
  audience = "MEMBERS",
  title = "🎼 Upcoming practices",
  canReply = true,
}: {
  memberId: string | null;
  manage: boolean;
  /** Admins: show whether each practice's venue is booked. */
  showVenueBooking?: boolean;
  take?: number;
  /** Choir practices (default) or alumni practices. */
  audience?: PracticeAudience;
  title?: string;
  /** False shows the practices without reply buttons (alumni looking at choir practices). */
  canReply?: boolean;
}) {
  const today = todayLocal();
  const practices = await listUpcomingPractices({ take, includeCancelled: true, audience });
  const scheduleHref = audience === "ALUMNI" ? "/alumni" : "/attendance";
  const replying = canReply && memberId !== null;
  const myRsvps =
    replying && memberId
      ? await getMemberRsvps(
          memberId,
          practices.map((practice) => practice.id),
        )
      : {};

  return (
    <Card>
      <CardHeader
        title={title}
        action={
          manage ? (
            <LinkButton href={scheduleHref} size="sm" variant="outline">
              Schedule
            </LinkButton>
          ) : null
        }
      />
      <CardBody className="space-y-3">
        {practices.length === 0 ? (
          <EmptyState title="No practices scheduled yet">
            {manage
              ? `Schedule one from the ${audience === "ALUMNI" ? "Alumni practices" : "Practices"} page.`
              : "Check back soon!"}
          </EmptyState>
        ) : null}
        {practices.map((practice) => {
          const label = `${practice.title} on ${formatIsoDate(practice.date, { year: undefined })}`;
          return (
            <div
              key={practice.id}
              className={
                manage
                  ? "group relative space-y-3 rounded-lg border border-slate-200 p-3 transition-colors hover:border-brand-300 hover:bg-slate-50/70"
                  : "space-y-3 rounded-lg border border-slate-200 p-3"
              }
            >
              {manage ? <PracticeCardLink practiceId={practice.id} label={label} /> : null}
              <PracticeDetails practice={practice} today={today} className="pr-6" />
              {showVenueBooking && practice.status === "SCHEDULED" ? <VenueBookingBadge practice={practice} /> : null}
              {replying && memberId ? (
                <div className="relative z-10">
                  <RsvpButtons
                    practiceId={practice.id}
                    practiceLabel={label}
                    current={myRsvps[practice.id] ?? null}
                    disabled={!canRsvp(practice, today)}
                  />
                </div>
              ) : null}
              {manage ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  {practice.status === "SCHEDULED" ? <RsvpCountBadges counts={practice.counts} /> : <span />}
                  <div className="relative z-10 flex gap-2">
                    {audience === "MEMBERS" && practice.date === today && practice.status === "SCHEDULED" ? (
                      <LinkButton href={`/attendance/${practice.id}`} size="sm">
                        Take attendance
                      </LinkButton>
                    ) : null}
                    <LinkButton href={`/attendance/${practice.id}/edit`} size="sm" variant="outline">
                      Edit
                    </LinkButton>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
