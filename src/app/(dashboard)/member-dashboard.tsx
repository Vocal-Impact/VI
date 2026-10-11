import { hasPermission, type SessionUser } from "@/modules/auth";
import { getAttendanceThreshold, getAttendedCounts } from "@/modules/attendance";
import { attendanceProgress } from "@/modules/attendance/domain";
import { getBirthdayDashboard } from "@/modules/birthdays";
import { getMembersByIds } from "@/modules/members";
import { formatIsoDate } from "@/shared/lib/dates";
import { Alert, Card, CardBody, CardHeader, PageHeader, Stat } from "@/shared/ui/layout";
import { STUDY_LEVEL_LABELS } from "@/modules/members/domain";
import { schedulePracticeAction } from "./attendance/actions";
import { PracticeForm } from "./attendance/practice-form";
import { UpcomingPractices } from "./upcoming-practices";

/** What a choir member sees: upcoming practices to reply to, their progress, today's birthdays. */
export async function MemberDashboard({ user }: { user: SessionUser }) {
  const firstName = user.name.split(" ")[0];
  if (!user.memberId) {
    return (
      <>
        <PageHeader title={`Hi ${firstName}!`} />
        <Alert tone="info">
          Your login isn&apos;t linked to a member record yet. Ask the committee to check your email.
        </Alert>
      </>
    );
  }

  const [[member], counts, threshold, birthdays] = await Promise.all([
    getMembersByIds([user.memberId]),
    getAttendedCounts([user.memberId]),
    getAttendanceThreshold(),
    getBirthdayDashboard(),
  ]);
  const attended = counts.get(user.memberId) ?? 0;
  const alumni = user.role === "ALUMNI" || user.role === "ALUMNI_COMMITTEE";
  // Batch leads schedule practices for their own level.
  const leadsLevel = hasPermission(user.role, "practices:level-manage") ? user.studyLevel : null;

  return (
    <>
      <PageHeader
        title={`Hi ${firstName} 👋`}
        description={formatIsoDate(birthdays.today, { weekday: "long", month: "long" })}
      />

      {member?.status === "PROSPECTIVE" ? (
        <Alert
          tone="info"
          title={`Welcome to Vocal Impact! ${attendanceProgress(attended, threshold)} practices`}
          className="mb-6"
        >
          After {threshold} practices the committee adds you to the main WhatsApp groups.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {alumni ? (
            <>
              <UpcomingPractices
                viewer={user}
                source="mine"
                scheduleHref={hasPermission(user.role, "practices:alumni-manage") ? "/alumni" : null}
                title="🎓 Alumni practices"
                take={6}
              />
              <UpcomingPractices
                viewer={user}
                source={["MEMBERS"]}
                canReply={false}
                title="🎼 Choir practices"
                take={4}
              />
            </>
          ) : (
            <UpcomingPractices viewer={user} source="mine" take={6} />
          )}
        </div>
        <div className="space-y-6">
          {alumni ? null : <Stat label="Practices you've attended" value={attended} />}
          {leadsLevel ? (
            <Card>
              <CardHeader
                title={`Schedule a practice for ${STUDY_LEVEL_LABELS[leadsLevel]}`}
                description="As batch lead you can schedule practices for your level."
              />
              <CardBody>
                <PracticeForm
                  action={schedulePracticeAction}
                  mode="schedule"
                  audience="LEVELS"
                  levelChoices={[leadsLevel]}
                  minDate={birthdays.today}
                  initial={{
                    date: birthdays.today,
                    startTime: "",
                    endTime: "",
                    title: `${STUDY_LEVEL_LABELS[leadsLevel]} practice`,
                    venue: "",
                    notes: "",
                  }}
                />
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="🎂 Birthdays today" />
            <CardBody>
              {birthdays.todays.length === 0 ? (
                <p className="text-sm text-slate-600">No birthdays today.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {birthdays.todays.map((entry) => (
                    <li key={entry.person.id}>🎉 {entry.person.name}</li>
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
