"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requirePermission } from "@/modules/auth";
import {
  deletePractice,
  schedulePractice,
  setAttendance,
  setPracticeCancelled,
  sendVenueRequestReminders,
  setRsvp,
  updatePractice,
  type RsvpResponse,
} from "@/modules/attendance";
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
  };
}

function refreshPractices(practiceId?: string): void {
  revalidatePath("/");
  revalidatePath("/attendance");
  if (practiceId) revalidatePath(`/attendance/${practiceId}`);
}

export async function schedulePracticeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("practices:manage");
  const values = formValues(formData);
  const result = await schedulePractice(practicePayload(values), user.id);
  if (!result.ok) return toActionState(result, "", values);
  const practiceId = result.value.id;
  // Remind the admins to book a venue with the IIT administration.
  after(async () => {
    try {
      await sendVenueRequestReminders(practiceId);
    } catch (error) {
      logger.warn("Venue request reminders failed", { practiceId, error: errorMessage(error) });
    }
  });
  refreshPractices();
  return {
    status: "success",
    message:
      "Practice scheduled. Members can now see it and reply, and admins were emailed a reminder to book the venue.",
  };
}

export async function updatePracticeAction(
  practiceId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("practices:manage");
  const values = formValues(formData);
  const result = await updatePractice(practiceId, practicePayload(values), user.id);
  if (!result.ok) return toActionState(result, "", values);
  refreshPractices(practiceId);
  redirect(`/attendance/${practiceId}`);
}

export async function setPracticeCancelledAction(practiceId: string, cancelled: boolean): Promise<void> {
  const user = await requirePermission("practices:manage");
  await setPracticeCancelled(practiceId, cancelled, user.id);
  refreshPractices(practiceId);
}

export async function deletePracticeAction(practiceId: string): Promise<void> {
  const user = await requirePermission("settings:manage");
  await deletePractice(practiceId, user.id);
  refreshPractices();
  redirect("/attendance");
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
  revalidatePath("/attendance/eligible");
  revalidatePath("/");
  return { ok: true, attendedCount: result.value.attendedCount };
}

/** "Going" / "Can't make it" — always for the signed-in person's own member record. */
export async function rsvpAction(practiceId: string, response: RsvpResponse): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePermission("practices:rsvp");
  if (!user.memberId) return { ok: false, error: "Your login isn't linked to a member record" };
  const result = await setRsvp({ practiceId, memberId: user.memberId, response });
  if (!result.ok) return { ok: false, error: result.error.message };
  refreshPractices(practiceId);
  return { ok: true };
}
