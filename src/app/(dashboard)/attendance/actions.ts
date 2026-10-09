"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { hasPermission, requirePermission, requireUser } from "@/modules/auth";
import {
  deletePractice,
  getPractice,
  schedulePractice,
  setAttendance,
  setPracticeCancelled,
  sendVenueRequestReminders,
  setRsvp,
  setVenueBooking,
  updatePractice,
  type VenueBookingStep,
  type RsvpResponse,
} from "@/modules/attendance";
import {
  isVenueReminderDue,
  managePermissionFor,
  venueReminderDueDate,
  type PracticeAudience,
} from "@/modules/attendance/domain";
import { todayLocal } from "@/shared/lib/clock";
import { formatIsoDate, isIsoDate } from "@/shared/lib/dates";
import { errorMessage, logger } from "@/shared/lib/logger";
import { formValues, toActionState, type ActionState } from "@/shared/lib/action-state";

function practicePayload(values: Record<string, string>) {
  return {
    date: values.date ?? "",
    startTime: values.startTime ?? "",
    endTime: values.endTime ?? "",
    title: values.title ?? "",
    venue: values.venue ?? "",
    notes: values.notes ?? "",
    audience: audienceFrom(values.audience),
  };
}

function audienceFrom(value: string | undefined): PracticeAudience {
  return value === "ALUMNI" ? "ALUMNI" : "MEMBERS";
}

/** Choir practices need practices:manage; alumni practices practices:alumni-manage. */
async function requirePracticeManager(practiceId: string) {
  const practice = await getPractice(practiceId);
  const user = await requirePermission(managePermissionFor(practice?.audience ?? "MEMBERS"));
  return { user, practice };
}

/**
 * Emails the admins the "book a venue" reminder once the response is sent, if
 * it's already due (the practice is two days away or sooner). Otherwise the
 * daily job sends it two days before.
 */
function remindAboutVenueSoon(practiceId: string): void {
  after(async () => {
    try {
      await sendVenueRequestReminders(practiceId);
    } catch (error) {
      logger.warn("Venue request reminders failed", { practiceId, error: errorMessage(error) });
    }
  });
}

function venueReminderNote(date: string | undefined): string {
  if (!date || !isIsoDate(date)) return "";
  const today = todayLocal();
  const dueNow = isVenueReminderDue(
    { date, status: "SCHEDULED", venueRequestedAt: null, venueReminderSentAt: null },
    today,
  );
  return dueNow
    ? "It's soon, so the admins were emailed a reminder to book the venue."
    : `Admins will get a reminder to book the venue on ${formatIsoDate(venueReminderDueDate(date), { year: undefined })} if it isn't marked as sent by then.`;
}

function refreshPractices(practiceId?: string): void {
  revalidatePath("/");
  revalidatePath("/attendance");
  revalidatePath("/alumni");
  if (practiceId) revalidatePath(`/attendance/${practiceId}`);
}

export async function schedulePracticeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const user = await requirePermission(managePermissionFor(audienceFrom(values.audience)));
  const result = await schedulePractice(practicePayload(values), user.id);
  if (!result.ok) return toActionState(result, "", values);
  const practiceId = result.value.id;
  remindAboutVenueSoon(practiceId);
  refreshPractices();
  return {
    status: "success",
    message: `Practice scheduled. Members can now see it and reply. ${venueReminderNote(values.date)}`,
  };
}

export async function updatePracticeAction(
  practiceId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requirePracticeManager(practiceId);
  const values = formValues(formData);
  const result = await updatePractice(practiceId, practicePayload(values), user.id);
  if (!result.ok) return toActionState(result, "", values);
  // Moved closer (e.g. to tomorrow)? The reminder may be due now.
  remindAboutVenueSoon(practiceId);
  refreshPractices(practiceId);
  redirect(`/attendance/${practiceId}`);
}

export async function setPracticeCancelledAction(practiceId: string, cancelled: boolean): Promise<void> {
  const { user } = await requirePracticeManager(practiceId);
  await setPracticeCancelled(practiceId, cancelled, user.id);
  refreshPractices(practiceId);
}

export async function deletePracticeAction(practiceId: string): Promise<void> {
  const user = await requirePermission("settings:manage");
  const practice = await getPractice(practiceId);
  await deletePractice(practiceId, user.id);
  refreshPractices();
  redirect(practice?.audience === "ALUMNI" ? "/alumni" : "/attendance");
}

export interface ToggleResult {
  ok: boolean;
  attendedCount?: number;
  error?: string;
}

/** Called from the checklist with optimistic UI; returns the member's new total. */
export async function toggleAttendanceAction(
  practiceId: string,
  memberId: string,
  present: boolean,
): Promise<ToggleResult> {
  const user = await requirePermission("attendance:write");
  const result = await setAttendance({ practiceId, memberId, present }, user);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/whatsapp-groups/ready");
  revalidatePath("/");
  return { ok: true, attendedCount: result.value.attendedCount };
}

/** "Going" / "Can't make it" — always for the signed-in person's own member record. */
export async function rsvpAction(practiceId: string, response: RsvpResponse): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  // Members reply to choir practices, alumni to alumni practices (checked again against the practice).
  if (!hasPermission(user.role, "practices:rsvp") && !hasPermission(user.role, "practices:alumni-rsvp"))
    return { ok: false, error: "You can't reply to practices" };
  if (!user.memberId) return { ok: false, error: "Your login isn't linked to a member record" };
  const result = await setRsvp({ practiceId, memberId: user.memberId, response });
  if (!result.ok) return { ok: false, error: result.error.message };
  refreshPractices(practiceId);
  return { ok: true };
}

export async function setVenueBookingAction(
  practiceId: string,
  step: VenueBookingStep,
  done: boolean,
  formData: FormData,
): Promise<void> {
  const user = await requirePermission("venues:book");
  const venue = formData.get("venue");
  await setVenueBooking(practiceId, { step, done, venue: typeof venue === "string" ? venue : undefined }, user.id);
  refreshPractices(practiceId);
}
