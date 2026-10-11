import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission, requireUser } from "@/modules/auth";
import {
  getTodaysPractice,
  listPastPractices,
  listProspectiveProgress,
  listInvitableMembers,
  listUpcomingPractices,
} from "@/modules/attendance";
import { attendanceProgress, canManagePractice, TENTATIVE_VENUE } from "@/modules/attendance/domain";
import {
  AudienceBadge,
  PracticeCardLink,
  PracticeDetails,
  RsvpCountBadges,
  VenueBookingBadge,
} from "@/modules/attendance/ui";
import { STUDY_LEVEL_LABELS, STUDY_LEVELS, VOICE_TYPE_LABELS } from "@/modules/members/domain";
import { cn } from "@/shared/lib/cn";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate } from "@/shared/lib/dates";
import { LinkButton } from "@/shared/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/shared/ui/layout";
import { FormDialog } from "@/shared/ui/client";
import { schedulePracticeAction } from "./actions";
import { BatchLeadPractices } from "./batch-lead-practices";
import { PracticeForm } from "./practice-form";
import { CappedList } from "@/shared/ui/capped-list";

export const metadata = { title: "Practices" };

export default async function PracticesPage() {
  const user = await requireUser();
  // Batch leads get a page of their own level's practices; everyone else here is committee.
  if (!hasPermission(user.role, "attendance:read")) {
    if (hasPermission(user.role, "practices:level-manage") && user.studyLevel) {
      return <BatchLeadPractices level={user.studyLevel} />;
    }
    redirect("/forbidden");
  }
  const canManage = hasPermission(user.role, "practices:manage");
  const canBookVenues = hasPermission(user.role, "venues:book");
  const today = todayLocal();
  const canInvite = hasPermission(user.role, "practices:invite-manage");
  const [todays, upcoming, past, progress, invitable] = await Promise.all([
    getTodaysPractice(),
    listUpcomingPractices({ includeCancelled: true }),
    listPastPractices(),
    listProspectiveProgress(),
    canInvite ? listInvitableMembers() : Promise.resolve([]),
  ]);
  const showProgress = progress.members.length > 0;

  return (
    <>
      <PageHeader
        title="Practices"
        description={`Schedule practices, see who's coming and take attendance.`}
        actions={
          <>
            {canManage ? (
              <FormDialog label="Schedule practice" title="Schedule a practice">
                <PracticeForm
                  action={schedulePracticeAction}
                  mode="schedule"
                  audienceChoices={canInvite ? ["MEMBERS", "LEVELS", "SELECTED"] : ["MEMBERS", "LEVELS"]}
                  levelChoices={STUDY_LEVELS}
                  members={invitable.map((member) => ({
                    id: member.id,
                    name: `${member.firstName} ${member.lastName}`,
                    detail:
                      member.status === "ALUMNI"
                        ? "Alumni"
                        : `${STUDY_LEVEL_LABELS[member.yearOfStudy]} · ${VOICE_TYPE_LABELS[member.voiceType]}`,
                  }))}
                  minDate={user.role === "ADMIN" ? undefined : today}
                  initial={{
                    date: today,
                    startTime: "",
                    endTime: "",
                    title: "Practice",
                    venue: TENTATIVE_VENUE,
                    notes: "",
                  }}
                />
              </FormDialog>
            ) : null}
            <LinkButton href="/attendance/reports" variant="outline">
              Reports
            </LinkButton>
          </>
        }
      />

      <div className={cn("grid gap-6", showProgress && "lg:grid-cols-3")}>
        <div className={cn("space-y-6", showProgress && "lg:col-span-2")}>
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
            <CappedList visible={4} label="Upcoming practices" className="space-y-3 px-4 py-4 sm:px-5">
              {upcoming.length === 0 ? (
                <EmptyState title="Nothing scheduled">
                  {canManage ? "Use Schedule practice above so members can reply." : "Nothing has been scheduled yet."}
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
                    {practice.status === "SCHEDULED" ? (
                      <span className="flex flex-wrap gap-1.5">
                        <RsvpCountBadges counts={practice.counts} />
                        {canBookVenues ? <VenueBookingBadge practice={practice} /> : null}
                      </span>
                    ) : null}
                  </div>
                  {canManagePractice(user, practice) ? (
                    <div className="relative z-10 flex gap-2">
                      <LinkButton href={`/attendance/${practice.id}?edit=1`} size="sm" variant="outline">
                        Edit
                      </LinkButton>
                    </div>
                  ) : null}
                </div>
              ))}
            </CappedList>
          </Card>

          <Card>
            <CardHeader title="Past practices" />
            <CardBody>
              {past.length === 0 ? (
                <p className="text-sm text-slate-600">No past practices yet.</p>
              ) : (
                <CappedList visible={8} items=":scope > ul > li" label="Past practices">
                  <ul className="divide-y divide-slate-100">
                    {past.map((practice) => (
                      <li key={practice.id}>
                        <Link
                          href={`/attendance/${practice.id}`}
                          className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"
                        >
                          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            <span className="font-medium">{formatIsoDate(practice.date)}</span>
                            <span className="text-slate-500">· {practice.title}</span>
                            <AudienceBadge practice={practice} />
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
                </CappedList>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Only while someone is working towards the threshold. */}
        {showProgress ? (
          <Card className="h-fit">
            <CardHeader
              title="New members' progress"
              description="Prospective members still working towards the threshold."
            />
            <CardBody>
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
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
