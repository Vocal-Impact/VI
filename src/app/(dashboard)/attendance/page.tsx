import Link from "next/link";
import { requirePermission, hasPermission } from "@/modules/auth";
import {
  getTodaysPractice,
  listPastPractices,
  listProspectiveProgress,
  listUpcomingPractices,
} from "@/modules/attendance";
import { attendanceProgress } from "@/modules/attendance/domain";
import { PracticeCardLink, PracticeDetails, RsvpCountBadges, VenueBookingBadge } from "@/modules/attendance/ui";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate } from "@/shared/lib/dates";
import { LinkButton } from "@/shared/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/shared/ui/layout";
import { schedulePracticeAction } from "./actions";
import { PracticeForm } from "./practice-form";

export const metadata = { title: "Practices" };

export default async function PracticesPage() {
  const user = await requirePermission("attendance:read");
  const canManage = hasPermission(user.role, "practices:manage");
  const canBookVenues = hasPermission(user.role, "venues:book");
  const today = todayLocal();
  const [todays, upcoming, past, progress] = await Promise.all([
    getTodaysPractice(),
    listUpcomingPractices({ includeCancelled: true }),
    listPastPractices(),
    listProspectiveProgress(),
  ]);

  return (
    <>
      <PageHeader
        title="Practices"
        description={`Schedule practices, see who's coming and take attendance. New members join the main WhatsApp groups after ${progress.threshold} practices.`}
        actions={
          <>
            <LinkButton href="/attendance/reports" variant="outline">
              Reports
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className={todays ? "border-brand-200 bg-brand-50" : undefined}>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              {todays ? (
                <>
                  <div>
                    <PracticeDetails practice={todays} today={today} />
                    <p className="mt-1 text-sm text-brand-700">{todays.attended} marked present so far</p>
                  </div>
                  {hasPermission(user.role, "attendance:write") ? (
                    <LinkButton href={`/attendance/${todays.id}`} size="lg">
                      Take attendance
                    </LinkButton>
                  ) : null}
                </>
              ) : (
                <div>
                  <p className="font-semibold text-ink">{formatIsoDate(today, { weekday: "long", month: "long" })}</p>
                  <p className="text-sm text-slate-600">
                    No practice is scheduled for today, so there&apos;s no attendance to take.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Upcoming" />
            <CardBody className="space-y-3">
              {upcoming.length === 0 ? (
                <EmptyState title="Nothing scheduled">Schedule the next practice so members can reply.</EmptyState>
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
                    {practice.status === "SCHEDULED" ? (
                      <span className="flex flex-wrap gap-1.5">
                        <RsvpCountBadges counts={practice.counts} />
                        {canBookVenues ? <VenueBookingBadge practice={practice} /> : null}
                      </span>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="relative z-10 flex gap-2">
                      <LinkButton href={`/attendance/${practice.id}/edit`} size="sm" variant="outline">
                        Edit
                      </LinkButton>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Past practices" />
            <CardBody>
              {past.length === 0 ? (
                <p className="text-sm text-slate-600">No past practices yet.</p>
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
                        {practice.status === "CANCELLED" ? (
                          <Badge tone="red">Cancelled</Badge>
                        ) : (
                          <Badge tone="brand">{practice.attended} present</Badge>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {canManage ? (
            <Card>
              <CardHeader title="Schedule a practice" />
              <CardBody>
                <PracticeForm
                  action={schedulePracticeAction}
                  mode="schedule"
                  minDate={user.role === "ADMIN" ? undefined : today}
                  initial={{ date: today, startTime: "", endTime: "", title: "Practice", venue: "", notes: "" }}
                />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="New members' progress"
              description="Prospective members still working towards the threshold."
            />
            <CardBody>
              {progress.members.length === 0 ? (
                <p className="text-sm text-slate-600">Nobody in progress.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {progress.members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-2">
                      <Link href={`/members/${member.id}`} className="hover:underline">
                        {member.firstName} {member.lastName}
                      </Link>
                      <Badge tone="amber">{attendanceProgress(member.attendedCount, progress.threshold)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
