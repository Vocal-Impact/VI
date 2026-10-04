import { getMemberRsvps, listUpcomingPractices } from "@/modules/attendance";
import { canRsvp } from "@/modules/attendance/domain";
import { PracticeDetails, RsvpCountBadges } from "@/modules/attendance/ui";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate } from "@/shared/lib/dates";
import { LinkButton } from "@/shared/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/shared/ui/layout";
import { RsvpButtons } from "./attendance/rsvp-buttons";

/**
 * Upcoming practices on the dashboard. Everyone with a member record can reply;
 * committee/admins also see reply counts and can edit or take attendance.
 */
export async function UpcomingPractices({
  memberId,
  manage,
  take = 4,
}: {
  memberId: string | null;
  manage: boolean;
  take?: number;
}) {
  const today = todayLocal();
  const practices = await listUpcomingPractices({ take, includeCancelled: true });
  const myRsvps = memberId
    ? await getMemberRsvps(
        memberId,
        practices.map((practice) => practice.id),
      )
    : {};

  return (
    <Card>
      <CardHeader
        title="🎼 Upcoming practices"
        action={
          manage ? (
            <LinkButton href="/attendance" size="sm" variant="outline">
              Schedule
            </LinkButton>
          ) : null
        }
      />
      <CardBody className="space-y-3">
        {practices.length === 0 ? (
          <EmptyState title="No practices scheduled yet">
            {manage ? "Schedule one from the Practices page." : "Check back soon!"}
          </EmptyState>
        ) : null}
        {practices.map((practice) => {
          const label = `${practice.title} on ${formatIsoDate(practice.date, { year: undefined })}`;
          return (
            <div key={practice.id} className="space-y-3 rounded-lg border border-slate-200 p-3">
              <PracticeDetails practice={practice} today={today} />
              {memberId ? (
                <RsvpButtons
                  practiceId={practice.id}
                  practiceLabel={label}
                  current={myRsvps[practice.id] ?? null}
                  disabled={!canRsvp(practice, today)}
                />
              ) : null}
              {manage ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  {practice.status === "SCHEDULED" ? <RsvpCountBadges counts={practice.counts} /> : <span />}
                  <div className="flex gap-2">
                    {practice.date === today && practice.status === "SCHEDULED" ? (
                      <LinkButton href={`/attendance/${practice.id}`} size="sm">
                        Take attendance
                      </LinkButton>
                    ) : (
                      <LinkButton href={`/attendance/${practice.id}`} size="sm" variant="secondary">
                        Who&apos;s coming
                      </LinkButton>
                    )}
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
