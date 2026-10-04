"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/modules/auth";
import {
  createGroup,
  markInviteJoined,
  moveGroup,
  sendInvites,
  setGroupArchived,
  updateGroup,
  type SendInvitesResult,
} from "@/modules/whatsapp-groups";
import { formValues, toActionState, type ActionState } from "@/shared/lib/action-state";

function groupPayload(values: Record<string, string>) {
  return {
    name: values.name ?? "",
    description: values.description ?? "",
    inviteLink: values.inviteLink ?? "",
    requiresEligibility: values.requiresEligibility === "on",
    isMainGroup: values.isMainGroup === "on",
    // Sent as "TENOR,BASS"; empty means every part can join.
    allowedVoiceTypes: (values.allowedVoiceTypes ?? "").split(",").filter(Boolean),
  };
}

export async function createGroupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("groups:manage");
  const values = formValues(formData);
  const result = await createGroup(groupPayload(values), user.id);
  if (result.ok) revalidatePath("/whatsapp-groups");
  return toActionState(result, "Group added", result.ok ? undefined : values);
}

export async function updateGroupAction(groupId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("groups:manage");
  const values = formValues(formData);
  const result = await updateGroup(groupId, groupPayload(values), user.id);
  if (result.ok) {
    revalidatePath("/whatsapp-groups");
    revalidatePath(`/whatsapp-groups/${groupId}`);
  }
  return toActionState(result, "Group updated", result.ok ? undefined : values);
}

export async function setGroupArchivedAction(groupId: string, archived: boolean): Promise<void> {
  const user = await requirePermission("groups:manage");
  await setGroupArchived(groupId, archived, user.id);
  revalidatePath("/whatsapp-groups");
}

export async function moveGroupAction(groupId: string, direction: "up" | "down"): Promise<void> {
  await requirePermission("groups:manage");
  await moveGroup(groupId, direction);
  revalidatePath("/whatsapp-groups");
}

export type SendInvitesActionResult = { ok: true; value: SendInvitesResult } | { ok: false; error: string };

export async function sendInvitesAction(input: {
  memberIds: string[];
  groupIds: string[];
  channel: "EMAIL" | "WHATSAPP_LINK" | "MANUAL";
  overrideEligibility: boolean;
}): Promise<SendInvitesActionResult> {
  const user = await requirePermission("invites:send");
  const result = await sendInvites(input, user);
  revalidatePath("/attendance/eligible");
  revalidatePath("/whatsapp-groups");
  for (const groupId of input.groupIds) revalidatePath(`/whatsapp-groups/${groupId}`);
  for (const memberId of input.memberIds) revalidatePath(`/members/${memberId}`);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, value: result.value };
}

export async function markJoinedAction(memberId: string, groupId: string): Promise<void> {
  const user = await requirePermission("invites:send");
  await markInviteJoined(memberId, groupId, user);
  revalidatePath(`/whatsapp-groups/${groupId}`);
  revalidatePath("/whatsapp-groups");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/attendance/eligible");
  revalidatePath("/");
}

/** Bulk "they're in the group" — e.g. for existing members added before the app. */
export async function markManyJoinedAction(
  groupId: string,
  memberIds: string[],
): Promise<{ ok: boolean; marked: number; error?: string }> {
  const user = await requirePermission("invites:send");
  let marked = 0;
  for (const memberId of memberIds.slice(0, 300)) {
    const result = await markInviteJoined(memberId, groupId, user);
    if (result.ok) marked += 1;
  }
  revalidatePath(`/whatsapp-groups/${groupId}`);
  revalidatePath("/whatsapp-groups");
  revalidatePath("/attendance/eligible");
  revalidatePath("/");
  return { ok: true, marked };
}
