"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth";
import {
  changeMemberStatus,
  createMember,
  hardDeleteMember,
  markAddedToWhatsapp,
  restoreMember,
  softDeleteMember,
  updateMember,
} from "@/modules/members";
import { removeMemberLocation, saveMemberLocation } from "@/modules/carpool";
import {
  commitImport,
  previewImport,
  IMPORT_PROFILES,
  type AnyPreview,
  type ImportProfileName,
  type ImportSummary,
} from "@/modules/imports";
import { formValues, toActionState, type ActionState } from "@/shared/lib/action-state";

function memberPayload(values: Record<string, string>) {
  return {
    firstName: values.firstName ?? "",
    lastName: values.lastName ?? "",
    studentId: values.studentId ?? "",
    yearOfStudy: values.yearOfStudy ?? "",
    whatsappNumber: values.whatsappNumber ?? "",
    email: values.email ?? "",
    voiceType: values.voiceType ?? "UNASSIGNED",
    dateOfBirth: values.dateOfBirth ?? "",
  };
}

export async function createMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("members:write");
  const values = formValues(formData);
  const result = await createMember(memberPayload(values), user.id);
  if (!result.ok) return toActionState(result, "", values);
  revalidatePath("/members");
  redirect(
    values.intent === "invite"
      ? `/whatsapp-groups/invite?members=${result.value.id}`
      : `/members/${result.value.id}?created=1`,
  );
}

export async function updateMemberAction(
  memberId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("members:write");
  const values = formValues(formData);
  const result = await updateMember(memberId, memberPayload(values), user.id);
  if (!result.ok) return toActionState(result, "", values);
  revalidatePath(`/members/${memberId}`);
  redirect(`/members/${memberId}`);
}

export async function changeStatusAction(memberId: string, formData: FormData): Promise<void> {
  const user = await requirePermission("members:write");
  await changeMemberStatus(memberId, formData.get("status"), user.id);
  revalidatePath(`/members/${memberId}`);
}

export async function markAddedAction(memberId: string): Promise<void> {
  const user = await requirePermission("members:write");
  await markAddedToWhatsapp(memberId, user.id);
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/attendance/eligible");
  revalidatePath("/");
}

export async function removeMemberAction(memberId: string): Promise<void> {
  const user = await requirePermission("members:write");
  await softDeleteMember(memberId, user.id);
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
}

export async function restoreMemberAction(memberId: string): Promise<void> {
  const user = await requirePermission("members:write");
  await restoreMember(memberId, user.id);
  revalidatePath(`/members/${memberId}`);
}

export async function eraseMemberAction(memberId: string): Promise<void> {
  const user = await requirePermission("members:delete");
  await hardDeleteMember(memberId, user.id);
  revalidatePath("/members");
  redirect("/members?erased=1");
}

export async function saveLocationAction(
  memberId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("carpool:write");
  const values = formValues(formData);
  const latitude = Number.parseFloat(values.latitude ?? "");
  const longitude = Number.parseFloat(values.longitude ?? "");
  const result = await saveMemberLocation(
    memberId,
    {
      areaLabel: values.areaLabel ?? "",
      consentGiven: values.consentGiven === "on",
      canDrive: values.canDrive === "on",
      seats: values.seats ?? "0",
      pin: Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null,
    },
    user.id,
  );
  if (result.ok) revalidatePath(`/members/${memberId}`);
  return toActionState(result, "Carpool details saved", values);
}

export async function removeLocationAction(memberId: string): Promise<void> {
  const user = await requirePermission("carpool:write");
  await removeMemberLocation(memberId, user.id);
  revalidatePath(`/members/${memberId}`);
}

// ─── CSV import ──────────────────────────────────────────────────────────

export interface ImportActionState {
  status: "idle" | "preview" | "done" | "error";
  message?: string;
  profile?: ImportProfileName;
  fileName?: string;
  csvText?: string;
  preview?: AnyPreview;
  summary?: ImportSummary;
}

function readProfile(value: FormDataEntryValue | null): ImportProfileName {
  return IMPORT_PROFILES.includes(value as ImportProfileName) ? (value as ImportProfileName) : "REGISTRATION";
}

export async function importAction(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const user = await requirePermission("imports:run");
  const profile = readProfile(formData.get("profile"));
  const step = formData.get("step");

  if (step === "commit") {
    const csvText = String(formData.get("csvText") ?? "");
    const fileName = String(formData.get("fileName") ?? "import.csv");
    const result = await commitImport(profile, csvText, fileName, user.id);
    if (!result.ok) return { status: "error", message: result.error.message, profile };
    revalidatePath("/members");
    revalidatePath("/");
    return { status: "done", profile, fileName, summary: result.value };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", message: "Choose a CSV file first", profile };
  if (!file.name.toLowerCase().endsWith(".csv"))
    return { status: "error", message: "The file must be a .csv export", profile };
  const csvText = await file.text();
  const result = await previewImport(profile, csvText);
  if (!result.ok) return { status: "error", message: result.error.message, profile };
  return { status: "preview", profile, fileName: file.name, csvText, preview: result.value };
}
