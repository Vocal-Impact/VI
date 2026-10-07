import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, hasPermission } from "@/modules/auth";
import { canTakeAttendance, canUnmarkAttendance, type RsvpPerson } from "@/modules/attendance";
import {
  getAttendanceChecklist,
  getAttendanceThreshold,
  getPractice,
  getRsvpSummary,
  getVenueRequestLinks,
} from "@/modules/attendance";
import { PracticeDetails, RsvpCountBadges, VenueBookingBadge } from "@/modules/attendance/ui";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { todayLocal } from "@/shared/lib/clock";
import { Button, buttonClasses, LinkButton } from "@/shared/ui/button";
import { ConfirmSubmit } from "@/shared/ui/client";
import { Input } from "@/shared/ui/form";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/shared/ui/layout";
import { deletePracticeAction, setPracticeCancelledAction, setVenueBookingAction } from "../actions";
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
  const canBookVenue =
    hasPermission(user.role, "venues:book") && practice.status === "SCHEDULED" && practice.date >= today;
  const [summary, entries, threshold, venueRequest] = await Promise.all([
    getRsvpSummary(practiceId),
    practice.date <= today ? getAttendanceChecklist(practiceId) : Promise.resolve([]),
    getAttendanceThreshold(),
    canBookVenue ? getVenueRequestLinks(practiceId, user) : Promise.resolve(null),
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
              {hasPermission(user.role, "carpool:read") && practice.status === "SCHEDULED" ? (
                <LinkButton href={`/carpool?practice=${practice.id}`} variant="secondary" size="sm">
                  Plan lifts home
                </LinkButton>
              ) : null}
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

      {venueRequest ? (
        <Card className="mb-6">
          <CardHeader
            title="Venue booking"
            description="Admins only. Ask the IIT administration for a venue, then record each step here."
            action={<VenueBookingBadge practice={practice} />}
          />
          <CardBody>
            <ol className="space-y-5">
              <li className="space-y-2">
                <p className="text-sm font-semibold text-ink">1. Send the request</p>
                {practice.venueRequestedAt ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-emerald-700">
                    <span>✓ Marked as sent on {formatTimestamp(practice.venueRequestedAt)}</span>
                    <form action={setVenueBookingAction.bind(null, practice.id, "requested", false)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Undo
                      </Button>
                    </form>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">
                      The email is already written. Open it in Gmail, check it and press Send, then mark it as sent.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={venueRequest.gmailUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClasses("primary", "sm")}
                      >
                        Open the email in Gmail
                      </a>
                      <form action={setVenueBookingAction.bind(null, practice.id, "requested", true)}>
                        <Button type="submit" variant="outline" size="sm">
                          Mark as sent
                        </Button>
                      </form>
                    </div>
                    <p className="text-xs text-slate-500">
                      To: {venueRequest.draft.to.length ? venueRequest.draft.to.join(", ") : "no recipients set yet"}
                      {venueRequest.draft.cc.length ? ` · Cc: ${venueRequest.draft.cc.join(", ")}` : ""} ·{" "}
                      <Link href="/settings" className="text-brand-700 hover:underline">
                        Change the wording
                      </Link>
                    </p>
                  </>
                )}
              </li>
              <li className="space-y-2">
                <p className="text-sm font-semibold text-ink">2. Venue confirmed by the administration</p>
                {practice.venueConfirmedAt ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-emerald-700">
                    <span>
                      ✓ {practice.venue ? <strong>{practice.venue}</strong> : "Confirmed"} on{" "}
                      {formatTimestamp(practice.venueConfirmedAt)}
                    </span>
                    <form action={setVenueBookingAction.bind(null, practice.id, "confirmed", false)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Undo
                      </Button>
                    </form>
                  </div>
                ) : (
                  <form
                    action={setVenueBookingAction.bind(null, practice.id, "confirmed", true)}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <label className="min-w-56 flex-1 text-sm">
                      <span className="mb-1 block text-slate-600">Venue they gave you</span>
                      <Input name="venue" defaultValue={practice.venue ?? ""} maxLength={120} />
                    </label>
                    <Button type="submit" size="sm">
                      Mark venue confirmed
                    </Button>
                  </form>
                )}
              </li>
            </ol>
          </CardBody>
        </Card>
      ) : null}

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

/** "Tue, 7 Oct, 3:45 PM" in Sri Lanka time. */
function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Colombo",
  }).format(new Date(iso));
}
