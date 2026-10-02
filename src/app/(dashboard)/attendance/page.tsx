import Link from "next/link";
import { requirePermission, hasPermission } from "@/modules/auth";
import { listPractices, listProspectiveProgress, getTodaysPractice } from "@/modules/attendance";
import { attendanceProgress } from "@/modules/attendance/domain";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate } from "@/shared/lib/dates";
import { LinkButton } from "@/shared/ui/button";
import { SubmitButton } from "@/shared/ui/client";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/shared/ui/layout";
import { startTodaysPracticeAction } from "./actions";
import { NewPracticeForm } from "./new-practice-form";

export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const user = await requirePermission("attendance:read");
  const canWrite = hasPermission(user.role, "attendance:write");
  const [practices, progress, today] = await Promise.all([
    listPractices(),
    listProspectiveProgress(),
    getTodaysPractice(),
  ]);

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`New members join the main WhatsApp groups after ${progress.threshold} practices.`}
        actions={
          <>
            <LinkButton href="/attendance/eligible" variant="secondary">
              Ready for WhatsApp
            </LinkButton>
            <LinkButton href="/attendance/reports" variant="outline">
              Reports
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {canWrite ? (
            <Card className="border-brand-200 bg-brand-50">
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-brand-800">
                    {formatIsoDate(todayLocal(), { weekday: "long", month: "long" })}
                  </p>
                  <p className="text-sm text-brand-700">
                    {today ? `${today._count.attendances} marked present so far` : "No practice recorded for today yet"}
                  </p>
                </div>
                {today ? (
                  <LinkButton href={`/attendance/${today.id}`} size="lg">
                    Continue taking attendance
                  </LinkButton>
                ) : (
                  <form action={startTodaysPracticeAction}>
                    <SubmitButton size="lg" pendingText="Starting…">
                      Start today&apos;s practice
                    </SubmitButton>
                  </form>
                )}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Practices" />
            <CardBody>
              {practices.length === 0 ? (
                <EmptyState title="No practices yet">
                  Start today&apos;s practice to begin taking attendance.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {practices.map((practice) => (
                    <li key={practice.id}>
                      <Link
                        href={`/attendance/${practice.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"
                      >
                        <span>
                          <span className="font-medium">{formatIsoDate(practice.date)}</span>{" "}
                          <span className="text-slate-500">— {practice.title}</span>
                        </span>
                        <Badge tone="brand">{practice._count.attendances} present</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
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
          {canWrite ? (
            <Card>
              <CardHeader title="Record another practice" description="For a different date or an extra session." />
              <CardBody>
                <NewPracticeForm today={todayLocal()} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
