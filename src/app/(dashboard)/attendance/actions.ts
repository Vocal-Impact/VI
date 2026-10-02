"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth";
import { createPractice, deletePractice, setAttendance, startTodaysPractice } from "@/modules/attendance";
import { formValues, toActionState, type ActionState } from "@/shared/lib/action-state";

export async function startTodaysPracticeAction(): Promise<void> {
  const user = await requirePermission("attendance:write");
  const result = await startTodaysPractice(user.id);
  if (!result.ok) throw new Error(result.error.message);
  redirect(`/attendance/${result.value.id}`);
}

export async function createPracticeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("attendance:write");
  const values = formValues(formData);
  const result = await createPractice(values, user.id);
  if (!result.ok) return toActionState(result, "", values);
  redirect(`/attendance/${result.value.id}`);
}

export async function deletePracticeAction(practiceId: string): Promise<void> {
  const user = await requirePermission("settings:manage");
  await deletePractice(practiceId, user.id);
  revalidatePath("/attendance");
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
