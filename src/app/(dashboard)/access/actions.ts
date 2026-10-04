"use server";

import { revalidatePath } from "next/cache";
import { createAllowlistedUser, requirePermission, setMemberAccess, updateUser } from "@/modules/auth";
import { ACCESS_LEVEL_LABELS, type AccessLevel } from "@/modules/auth/domain";
import { formValues, toActionState, type ActionState } from "@/shared/lib/action-state";

function refresh(memberId?: string): void {
  revalidatePath("/access");
  if (memberId) revalidatePath(`/members/${memberId}`);
}

export async function setMemberAccessAction(
  memberId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("users:manage");
  const values = formValues(formData);
  const result = await setMemberAccess(
    { memberId, level: values.level, receivesBirthdayReminders: values.receivesBirthdayReminders === "on" },
    actor.id,
  );
  if (result.ok) refresh(memberId);
  const label = ACCESS_LEVEL_LABELS[(values.level as AccessLevel) ?? "NONE"] ?? values.level;
  return toActionState(result, result.ok && result.value.level === "NONE" ? "Access removed" : `Saved: ${label}`);
}

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("users:manage");
  const values = formValues(formData);
  const result = await createAllowlistedUser(values, actor.id);
  if (result.ok) refresh();
  return toActionState(result, `${values.email} can now sign in with Google`, result.ok ? undefined : values);
}

export async function updateUserAction(userId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("users:manage");
  const values = formValues(formData);
  const result = await updateUser(
    {
      userId,
      role: values.role,
      active: values.active === "on",
      receivesBirthdayReminders: values.receivesBirthdayReminders === "on",
    },
    actor.id,
  );
  if (result.ok) refresh();
  return toActionState(result, "Account updated");
}
