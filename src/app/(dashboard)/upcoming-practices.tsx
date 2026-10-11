import {
  getInviteProfile,
  getMemberRsvps,
  listUpcomingPractices,
  listUpcomingPracticesFor,
} from "@/modules/attendance";
import { canManagePractice, canReplyTo, canRsvp, type PracticeAudience } from "@/modules/attendance/domain";
import { hasPermission, type SessionUser } from "@/modules/auth";
import { PracticeCardLink, PracticeDetails, RsvpCountBadges, VenueBookingBadge } from "@/modules/attendance/ui";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate } from "@/shared/lib/dates";
import { LinkButton } from "@/shared/ui/button";
import { Card, CardHeader, EmptyState } from "@/shared/ui/layout";
import { RsvpButtons } from "./attendance/rsvp-buttons";
import { CappedList } from "@/shared/ui/capped-list";

/**
 * Upcoming practices on the dashboard. Each practice gets Going / Can't make
 * it if the viewer is invited to it, and reply counts with Edit (and Take
 * attendance on the day) if the viewer organises it.
 */
export async function UpcomingPractices({
  viewer,
  source,
  showVenueBooking = false,
  take = 4,
  title = "🎼 Upcoming practices",
  canReply = true,
  scheduleHref = null,
}: {
  viewer: Pick<SessionUser, "role" | "studyLevel" | "memberId">;
  /** "mine": the practices the viewer is invited to; otherwise these kinds of practice. */
  source: "mine" | readonly PracticeAudience[];
  /** Admins: show whether each practice's venue is booked. */
  showVenueBooking?: boolean;
  take?: number;
  title?: string;
  /** False shows the practices without reply buttons (alumni looking at choir practices). */
  canReply?: boolean;
  /** Where to schedule one (shown as a button), if the viewer can. */
  scheduleHref?: string | null;
}) {
  const today = todayLocal();
  const [practices, member] = await Promise.all([
    source === "mine"
      ? viewer.memberId
        ? listUpcomingPracticesFor(viewer.memberId, { take })
        : Promise.resolve([])
      : listUpcomingPractices({ take, includeCancelled: true, audiences: source }),
    canReply && viewer.memberId ? getInviteProfile(viewer.memberId) : Promise.resolve(null),
  ]);
  const replyable = new Set(
    member ? practices.filter((practice) => canReplyTo(member, practice)).map((practice) => practice.id) : [],
  );
  const myRsvps =
    member && replyable.size > 0 ? await getMemberRsvps(member.id, [...replyable]) : ({} as Record<string, never>);

  return (
    <Card>
      <CardHeader
        title={title}
        action={
          scheduleHref ? (
            <LinkButton href={scheduleHref} size="sm" variant="outline">
              Schedule
            </LinkButton>
          ) : null
        }
      />
      <CappedList visible={4} label="Upcoming practices" className="space-y-3 px-4 py-4 sm:px-5">
        {practices.length === 0 ? (
          <EmptyState title="No practices scheduled yet">
            {scheduleHref ? "Schedule one with the button above." : "Check back soon!"}
          </EmptyState>
        ) : null}
        {practices.map((practice) => {
          const label = `${practice.title} on ${formatIsoDate(practice.date, { year: undefined })}`;
          const manage = canManagePractice(viewer, practice);
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
              {replyable.has(practice.id) ? (
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
                    {practice.audience !== "ALUMNI" &&
                    practice.date === today &&
                    practice.status === "SCHEDULED" &&
                    hasPermission(viewer.role, "attendance:write") ? (
                      <LinkButton href={`/attendance/${practice.id}`} size="sm">
                        Take attendance
                      </LinkButton>
                    ) : null}
                    <LinkButton href={`/attendance/${practice.id}?edit=1`} size="sm" variant="outline">
                      Edit
                    </LinkButton>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </CappedList>
    </Card>
  );
}
