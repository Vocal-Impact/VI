import Link from "next/link";
import { listPastPractices, listUpcomingPractices, TENTATIVE_VENUE } from "@/modules/attendance";
import { PracticeCardLink, PracticeDetails, RsvpCountBadges } from "@/modules/attendance/ui";
import { STUDY_LEVEL_LABELS, type StudyLevel } from "@/modules/members/domain";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate } from "@/shared/lib/dates";
import { LinkButton } from "@/shared/ui/button";
import { FormDialog } from "@/shared/ui/client";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/shared/ui/layout";
import { schedulePracticeAction } from "./actions";
import { PracticeForm } from "./practice-form";

/**
 * The Practices page for batch leads: only the practices for their own level,
 * which they schedule, edit and cancel. Choir-wide practices stay on their
 * dashboard to reply to; attendance stays with the committee.
 */
export async function BatchLeadPractices({ level }: { level: StudyLevel }) {
  const today = todayLocal();
  const label = STUDY_LEVEL_LABELS[level];
  const [upcoming, past] = await Promise.all([
    listUpcomingPractices({ includeCancelled: true, audiences: ["LEVELS"], levels: [level] }),
    listPastPractices(20, ["LEVELS"], [level]),
  ]);

  return (
    <>
      <PageHeader
        title={`${label} practices`}
        description={`As batch lead you schedule practices for ${label}. Only ${label} members see them on their dashboard and reply.`}
        actions={
          <FormDialog label="Schedule practice" title={`Schedule a practice for ${label}`}>
            <PracticeForm
              action={schedulePracticeAction}
              mode="schedule"
              audience="LEVELS"
              levelChoices={[level]}
              minDate={today}
              initial={{
                date: today,
                startTime: "",
                endTime: "",
                title: `${label} practice`,
                venue: TENTATIVE_VENUE,
                notes: "",
              }}
            />
          </FormDialog>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Upcoming" />
          <CardBody className="space-y-3">
            {upcoming.length === 0 ? (
              <EmptyState title="Nothing scheduled">
                Use Schedule practice above. {label} members will see it on their dashboard.
              </EmptyState>
            ) : null}
            {upcoming.map((practice) => (
              <div
                key={practice.id}
                className="group relative flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 pr-9 transition-colors hover:border-brand-300 hover:bg-slate-50/70"
              >
                <PracticeCardLink
                  practiceId={practice.id}
                  label={`${practice.title} on ${formatIsoDate(practice.date, { year: undefined })}`}
                />
                <div className="space-y-2">
                  <PracticeDetails practice={practice} today={today} />
                  {practice.status === "SCHEDULED" ? <RsvpCountBadges counts={practice.counts} /> : null}
                </div>
                <div className="relative z-10">
                  <LinkButton href={`/attendance/${practice.id}?edit=1`} size="sm" variant="outline">
                    Edit
                  </LinkButton>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Past practices" />
          <CardBody>
            {past.length === 0 ? (
              <p className="text-sm text-slate-600">No past {label} practices yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {past.map((practice) => (
                  <li key={practice.id}>
                    <Link
                      href={`/attendance/${practice.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"
                    >
                      <span>
                        <span className="font-medium">{formatIsoDate(practice.date)}</span>{" "}
                        <span className="text-slate-500">· {practice.title}</span>
                      </span>
                      {practice.status === "CANCELLED" ? <Badge tone="red">Cancelled</Badge> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
