import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, hasPermission } from "@/modules/auth";
import {
  canManagePractice,
  canTakeAttendance,
  canUnmarkAttendance,
  isTentativeVenue,
  practicePhase,
  venueReminderDueDate,
  type RsvpPerson,
} from "@/modules/attendance";
import {
  getAttendanceChecklist,
  getAttendanceThreshold,
  getPractice,
  getRsvpSummary,
  getVenueRequestLinks,
} from "@/modules/attendance";
import { PracticeDetails, RsvpCountBadges, VenueBookingBadge } from "@/modules/attendance/ui";
import { nowLocal } from "@/shared/lib/clock";
import { isFeatureEnabled } from "@/shared/config/features";
import { formatIsoDate } from "@/shared/lib/dates";
import { buttonClasses, LinkButton } from "@/shared/ui/button";
import { ConfirmSubmit, SubmitButton } from "@/shared/ui/client";
import { Input } from "@/shared/ui/form";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/shared/ui/layout";
import { deletePracticeAction, setPracticeCancelledAction, setVenueBookingAction } from "../actions";
import { AttendanceChecklist } from "./attendance-checklist";
import { EditPracticeDialog } from "./edit-practice-dialog";
import { RsvpBoard, type RsvpBoardPerson } from "./rsvp-board";
import { VenueConfirmButton } from "./venue-confirm-button";

export const metadata = { title: "Practice" };

export default async function PracticePage(props: PageProps<"/attendance/[practiceId]">) {
  const user = await requireUser();
  const { practiceId } = await props.params;
  const practice = await getPractice(practiceId);
  if (!practice) notFound();
  // The committee sees every choir practice; organisers (alumni organisers, batch leads) the ones they run.
  const alumni = practice.audience === "ALUMNI";
  const canManage = canManagePractice(user, practice);
  const canSeeAttendance = !alumni && hasPermission(user.role, "attendance:read");
  if (!canManage && !canSeeAttendance) redirect("/forbidden");

  const now = nowLocal();
  const today = now.date;
  const phase = practicePhase(practice, now);
  const practiceLabel = `${practice.title} on ${formatIsoDate(practice.date, { weekday: "long", month: "long", year: undefined })}`;
  const canOpenProfiles = hasPermission(user.role, "members:read");
  // Batch leads have their own level's Practices page; others reaching here manage it from the dashboard.
  const back = alumni
    ? { href: "/alumni", label: "Alumni practices" }
    : canSeeAttendance || hasPermission(user.role, "practices:level-manage")
      ? { href: "/attendance", label: "Practices" }
      : { href: "/", label: "Dashboard" };
  const attendanceOpen = !alumni && canTakeAttendance(user.role, practice, today);
  const isFuture = practice.date > today;
  const canBookVenue =
    hasPermission(user.role, "venues:book") && practice.status === "SCHEDULED" && practice.date >= today;
  const [summary, entries, threshold, venueRequest] = await Promise.all([
    getRsvpSummary(practiceId),
    practice.date <= today && canSeeAttendance ? getAttendanceChecklist(practiceId) : Promise.resolve([]),
    getAttendanceThreshold(),
    canBookVenue ? getVenueRequestLinks(practiceId, user) : Promise.resolve(null),
  ]);

  // On the practice day, attendance comes straight after the details: it's what the page is for then.
  const attendanceToday =
    canSeeAttendance && attendanceOpen && practice.date === today && practice.status === "SCHEDULED";
  const attendanceSection = !canSeeAttendance ? null : practice.status === "CANCELLED" ? (
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
        prominent={attendanceToday}
        live={attendanceToday && phase === "ONGOING"}
      />
    </>
  );

  return (
    <>
      <PageHeader
        back={
          <Link href={back.href} className="text-sm text-brand-700 hover:underline">
            ← {back.label}
          </Link>
        }
        title={practice.title}
        actions={
          canManage ? (
            <>
              <EditPracticeDialog practice={practice} user={user} />
              {!alumni &&
              hasPermission(user.role, "carpool:read") &&
              isFeatureEnabled("liftsHome") &&
              practice.status === "SCHEDULED" ? (
                <LinkButton href={`/carpool?practice=${practice.id}`} variant="secondary" size="sm">
                  Plan lifts home
                </LinkButton>
              ) : null}
              <form action={setPracticeCancelledAction.bind(null, practice.id, practice.status !== "CANCELLED")}>
                {alumni ? (
                  <Alert tone="info">This is an alumni practice. Attendance isn&apos;t taken for it.</Alert>
                ) : practice.status === "CANCELLED" ? (
                  <SubmitButton
                    variant="secondary"
                    size="sm"
                    pendingText="Restoring…"
                    confirm={{
                      title: "Restore this practice?",
                      description: `${practiceLabel} will be back on members' dashboards, and they can reply again.`,
                      confirmLabel: "Restore practice",
                    }}
                  >
                    Restore practice
                  </SubmitButton>
                ) : (
                  <ConfirmSubmit
                    variant="ghost"
                    size="sm"
                    confirm={{
                      title: "Cancel this practice?",
                      description: `${practiceLabel} will show as cancelled to members, and replies will close. You can restore it later.`,
                      confirmLabel: "Cancel practice",
                      cancelLabel: "Keep it",
                    }}
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
                    confirm={{
                      title: "Delete this practice?",
                      description: `${practiceLabel} will be deleted with all its replies and attendance marks. This can't be undone.`,
                      confirmLabel: "Delete practice",
                    }}
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
          <PracticeDetails practice={practice} today={today} phase={phase} />
          {practice.status === "SCHEDULED" ? <RsvpCountBadges counts={summary.counts} /> : null}
        </CardBody>
      </Card>

      {attendanceToday ? <div className="mb-6">{attendanceSection}</div> : null}

      {venueRequest ? (
        <Card className="mb-6">
          <CardHeader title="Venue booking" action={<VenueBookingBadge practice={practice} />} />
          <CardBody>
            <ol className="space-y-5">
              <li className="space-y-2">
                <p className="text-sm font-semibold text-ink">1. Send the request</p>
                {!practice.venueRequestedAt ? (
                  <p className="text-xs text-slate-500">
                    {practice.venueReminderSentAt
                      ? `📧 Admins were emailed a reminder on ${formatTimestamp(practice.venueReminderSentAt)}.`
                      : `📧 If it isn't marked as sent, admins get a reminder email on ${formatIsoDate(
                          venueReminderDueDate(practice.date) > today ? venueReminderDueDate(practice.date) : today,
                          { year: undefined },
                        )}.`}
                  </p>
                ) : null}
                {practice.venueRequestedAt ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-emerald-700">
                    <span>✓ Marked as sent on {formatTimestamp(practice.venueRequestedAt)}</span>
                    <form action={setVenueBookingAction.bind(null, practice.id, "requested", false)}>
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        pendingText="Undoing…"
                        confirm={{
                          title: "Undo “request sent”?",
                          description: "The request and the venue confirmation will both be marked as not done.",
                          confirmLabel: "Undo",
                        }}
                      >
                        Undo
                      </SubmitButton>
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
                        <SubmitButton
                          variant="outline"
                          size="sm"
                          confirm={{
                            title: "Mark the venue request as sent?",
                            description:
                              "Only do this once the email has gone to the IIT administration. The other admins won't get a reminder for this practice.",
                            confirmLabel: "Mark as sent",
                          }}
                        >
                          Mark as sent
                        </SubmitButton>
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
                      ✓ {isTentativeVenue(practice.venue) ? "Confirmed" : <strong>{practice.venue}</strong>} on{" "}
                      {formatTimestamp(practice.venueConfirmedAt)}
                    </span>
                    <form action={setVenueBookingAction.bind(null, practice.id, "confirmed", false)}>
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        pendingText="Undoing…"
                        confirm={{ title: "Undo “venue confirmed”?", confirmLabel: "Undo" }}
                      >
                        Undo
                      </SubmitButton>
                    </form>
                  </div>
                ) : (
                  <form
                    action={setVenueBookingAction.bind(null, practice.id, "confirmed", true)}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <label className="min-w-56 flex-1 text-sm">
                      <span className="mb-1 block text-slate-600">Venue they gave you</span>
                      <Input
                        name="venue"
                        defaultValue={isTentativeVenue(practice.venue) ? "" : (practice.venue ?? "")}
                        maxLength={120}
                      />
                    </label>
                    <VenueConfirmButton />
                  </form>
                )}
              </li>
            </ol>
          </CardBody>
        </Card>
      ) : null}

      {(canManage || hasPermission(user.role, "rsvps:read")) && practice.status === "SCHEDULED" ? (
        <RsvpBoard
          going={summary.going.map(forBoard)}
          notGoing={summary.notGoing.map(forBoard)}
          noResponse={summary.noResponse.map(forBoard)}
          linkToProfiles={canOpenProfiles}
        />
      ) : null}

      {attendanceToday ? null : attendanceSection}
    </>
  );
}

/** A reply for the board, with the time formatted here so the browser shows the same text. */
function forBoard(person: RsvpPerson): RsvpBoardPerson {
  return {
    memberId: person.memberId,
    name: person.name,
    voiceType: person.voiceType,
    replied: person.respondedAt
      ? person.respondedAt.toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Colombo",
        })
      : null,
  };
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
