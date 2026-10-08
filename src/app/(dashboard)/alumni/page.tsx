import Link from "next/link";
import { requirePermission } from "@/modules/auth";
import { listPastPractices, listUpcomingPractices } from "@/modules/attendance";
import { PracticeCardLink, PracticeDetails, RsvpCountBadges } from "@/modules/attendance/ui";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate } from "@/shared/lib/dates";
import { LinkButton } from "@/shared/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/shared/ui/layout";
import { schedulePracticeAction } from "../attendance/actions";
import { PracticeForm } from "../attendance/practice-form";

export const metadata = { title: "Alumni practices" };

/** Practices for alumni (e.g. guest performances). Only alumni see and reply to them. */
export default async function AlumniPracticesPage() {
  await requirePermission("practices:alumni-manage");
  const today = todayLocal();
  const [upcoming, past] = await Promise.all([
    listUpcomingPractices({ includeCancelled: true, audience: "ALUMNI" }),
    listPastPractices(20, "ALUMNI"),
  ]);

  return (
    <>
      <PageHeader title="Alumni practices" description="Only alumni see these on their dashboard and reply." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Upcoming" />
            <CardBody className="space-y-3">
              {upcoming.length === 0 ? <EmptyState title="Nothing scheduled" /> : null}
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
                  <div className="relative z-10 flex gap-2">
                    <LinkButton href={`/attendance/${practice.id}/edit`} size="sm" variant="outline">
                      Edit
                    </LinkButton>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Past alumni practices" />
            <CardBody>
              {past.length === 0 ? (
                <p className="text-sm text-slate-600">None yet.</p>
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
                          <span className="text-slate-500">— {practice.title}</span>
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

        <Card>
          <CardHeader title="Schedule an alumni practice" />
          <CardBody>
            <PracticeForm
              action={schedulePracticeAction}
              mode="schedule"
              audience="ALUMNI"
              minDate={today}
              initial={{ date: today, startTime: "", endTime: "", title: "Alumni practice", venue: "", notes: "" }}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
