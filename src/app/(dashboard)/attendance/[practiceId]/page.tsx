import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, hasPermission } from "@/modules/auth";
import { canTakeAttendance, canUnmarkAttendance, type RsvpPerson } from "@/modules/attendance";
import { getAttendanceChecklist, getAttendanceThreshold, getPractice, getRsvpSummary } from "@/modules/attendance";
import { PracticeDetails, RsvpCountBadges } from "@/modules/attendance/ui";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { todayLocal } from "@/shared/lib/clock";
import { Button, LinkButton } from "@/shared/ui/button";
import { ConfirmSubmit } from "@/shared/ui/client";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/shared/ui/layout";
import { deletePracticeAction, setPracticeCancelledAction } from "../actions";
import { AttendanceChecklist } from "./attendance-checklist";

export const metadata = { title: "Practice" };

export default async function PracticePage(props: PageProps<"/attendance/[practiceId]">) {
  const user = await requirePermission("attendance:read");
  const { practiceId } = await props.params;
  const practice = await getPractice(practiceId);
  if (!practice) notFound();

  const today = todayLocal();
  const canManage = hasPermission(user.role, "practices:manage");
  const attendanceOpen = canTakeAttendance(user.role, practice, today);
  const isFuture = practice.date > today;
  const [summary, entries, threshold] = await Promise.all([
    getRsvpSummary(practiceId),
    practice.date <= today ? getAttendanceChecklist(practiceId) : Promise.resolve([]),
    getAttendanceThreshold(),
  ]);

  return (
    <>
      <PageHeader
        back={
          <Link href="/attendance" className="text-sm text-brand-700 hover:underline">
            ← Practices
          </Link>
        }
        title={practice.title}
        actions={
          canManage ? (
            <>
              <LinkButton href={`/attendance/${practice.id}/edit`} variant="outline" size="sm">
                Edit details
              </LinkButton>
              <form action={setPracticeCancelledAction.bind(null, practice.id, practice.status !== "CANCELLED")}>
                {practice.status === "CANCELLED" ? (
                  <Button type="submit" variant="secondary" size="sm">
                    Restore practice
                  </Button>
                ) : (
                  <ConfirmSubmit
                    variant="ghost"
                    size="sm"
                    message="Cancel this practice? Members will see it as cancelled."
                  >
                    Cancel practice
                  </ConfirmSubmit>
                )}
              </form>
              {hasPermission(user.role, "settings:manage") ? (
                <form action={deletePracticeAction.bind(null, practice.id)}>
                  <ConfirmSubmit
                    variant="ghost"
                    size="sm"
                    message="Delete this practice with all its replies and attendance marks?"
                  >
                    Delete
                  </ConfirmSubmit>
                </form>
              ) : null}
            </>
          ) : null
        }
      />

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <PracticeDetails practice={practice} today={today} />
          {practice.status === "SCHEDULED" ? <RsvpCountBadges counts={summary.counts} /> : null}
        </CardBody>
      </Card>

      {hasPermission(user.role, "rsvps:read") && practice.status === "SCHEDULED" ? (
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <RsvpList title="Going" tone="text-emerald-700" people={summary.going} showTime />
          <RsvpList title="Can't make it" tone="text-red-600" people={summary.notGoing} showTime />
          <RsvpList title="No reply yet" tone="text-slate-500" people={summary.noResponse} />
        </div>
      ) : null}

      {practice.status === "CANCELLED" ? (
        <Alert tone="warning">This practice was cancelled, so there is no attendance to take.</Alert>
      ) : isFuture ? (
        <Alert tone="info">Attendance opens on the practice day.</Alert>
      ) : (
        <>
          {!attendanceOpen ? (
            <Alert tone="info" className="mb-4">
              This practice has passed. Only admins can change its attendance.
            </Alert>
          ) : null}
          <AttendanceChecklist
            practiceId={practice.id}
            entries={entries}
            threshold={threshold}
            readOnly={!attendanceOpen || !hasPermission(user.role, "attendance:write")}
            canUnmark={canUnmarkAttendance(user.role, practice.date, today)}
          />
        </>
      )}
    </>
  );
}

function RsvpList({
  title,
  tone,
  people,
  showTime = false,
}: {
  title: string;
  tone: string;
  people: RsvpPerson[];
  showTime?: boolean;
}) {
  return (
    <Card>
      <CardHeader title={`${title} (${people.length})`} className={tone} />
      <CardBody>
        {people.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody.</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto text-sm">
            {people.map((person) => (
              <li key={person.memberId} className="flex justify-between gap-2">
                <Link href={`/members/${person.memberId}`} className="truncate hover:underline">
                  {person.name}
                </Link>
                <span className="shrink-0 text-xs text-slate-500">
                  {showTime && person.respondedAt
                    ? person.respondedAt.toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Colombo",
                      })
                    : VOICE_TYPE_LABELS[person.voiceType as VoiceType]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
