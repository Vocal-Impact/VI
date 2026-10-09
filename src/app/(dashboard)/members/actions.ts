"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
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
import { geocodeLocations, removeMemberLocation, saveMemberLocation } from "@/modules/carpool";
import {
  commitImport,
  previewImport,
  IMPORT_PROFILES,
  type AnyPreview,
  type ImportProfileName,
  type ImportSummary,
} from "@/modules/imports";
import { formValues, toActionState, type ActionState } from "@/shared/lib/action-state";
import { parseCoordinates, type Coordinates } from "@/shared/lib/coordinates";
import { errorMessage, logger } from "@/shared/lib/logger";

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
    dietaryPreference: values.dietaryPreference ?? "",
    status: values.status ?? "",
  };
}

/** Looks up coordinates for just-saved locations once the response has been sent. */
function geocodeSoon(memberIds: string[]): void {
  if (memberIds.length === 0) return;
  after(async () => {
    try {
      await geocodeLocations({ memberIds, limit: memberIds.length });
    } catch (error) {
      logger.warn("Background geocoding failed", { error: errorMessage(error) });
    }
  });
}

type LocationFields =
  | { ok: true; location: { areaLabel: string; coordinates: Coordinates | null } | null }
  | { ok: false; fieldErrors: Record<string, string[]> };

/** The optional location on the Add member form: a landmark and/or pasted coordinates. */
function readLocationFields(values: Record<string, string>): LocationFields {
  const area = values.areaLabel?.trim() ?? "";
  const coordinatesText = values.coordinates?.trim() ?? "";
  if (!area && !coordinatesText) return { ok: true, location: null };
  const coordinates = coordinatesText ? parseCoordinates(coordinatesText) : null;
  if (coordinatesText && !coordinates)
    return {
      ok: false,
      fieldErrors: { coordinates: ["Paste two numbers separated by a comma, e.g. 6.8664, 79.8774"] },
    };
  if (values.consentGiven !== "on")
    return {
      ok: false,
      fieldErrors: { consentGiven: ["Tick this only if the member agreed, or leave the location empty"] },
    };
  return { ok: true, location: { areaLabel: area || coordinatesText, coordinates } };
}

export async function createMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("members:write");
  const values = formValues(formData);
  const location = readLocationFields(values);
  if (!location.ok)
    return { status: "error", message: "Check the location", fieldErrors: location.fieldErrors, values };

  const result = await createMember(memberPayload(values), user.id);
  if (!result.ok) return toActionState(result, "", values);
  const memberId = result.value.id;

  if (location.location) {
    const saved = await saveMemberLocation(
      memberId,
      {
        areaLabel: location.location.areaLabel,
        consentGiven: true,
        canDrive: false,
        seats: "0",
        pin: location.location.coordinates,
      },
      user.id,
    );
    if (!saved.ok)
      logger.warn("Member added but their location was not saved", { memberId, error: saved.error.message });
    else if (!location.location.coordinates) geocodeSoon([memberId]);
  }
  revalidatePath("/members");
  redirect(`/members/${memberId}?created=1`);
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
  revalidatePath("/whatsapp-groups/ready");
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
  revalidatePath("/members");
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
  // Pasted Google Maps coordinates win over a dropped pin.
  const pastedText = values.coordinates?.trim() ?? "";
  const pasted = pastedText ? parseCoordinates(pastedText) : null;
  if (pastedText && !pasted) {
    return {
      status: "error",
      message: "Paste the coordinates as two numbers separated by a comma, e.g. 6.8664, 79.8774",
      fieldErrors: { coordinates: ["Not a coordinate pair"] },
      values,
    };
  }
  const latitude = pasted?.latitude ?? Number.parseFloat(values.latitude ?? "");
  const longitude = pasted?.longitude ?? Number.parseFloat(values.longitude ?? "");
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
  if (result.ok) {
    revalidatePath(`/members/${memberId}`);
    if (!pasted && !(Number.isFinite(latitude) && Number.isFinite(longitude))) geocodeSoon([memberId]);
  }
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
  /** First-time load of existing members: take new members' status from the file. */
  useStatusColumn?: boolean;
}

function readProfile(value: FormDataEntryValue | null): ImportProfileName {
  return IMPORT_PROFILES.includes(value as ImportProfileName) ? (value as ImportProfileName) : "REGISTRATION";
}

export async function importAction(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const user = await requirePermission("imports:run");
  const profile = readProfile(formData.get("profile"));
  const step = formData.get("step");
  const useStatusColumn = profile === "REGISTRATION" && formData.get("useStatusColumn") === "on";

  if (step === "commit") {
    const csvText = String(formData.get("csvText") ?? "");
    const fileName = String(formData.get("fileName") ?? "import.csv");
    const result = await commitImport(profile, csvText, fileName, user.id, { useStatusColumn });
    if (!result.ok) return { status: "error", message: result.error.message, profile };
    geocodeSoon(result.value.locationsToGeocode);
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
  const result = await previewImport(profile, csvText, { useStatusColumn });
  if (!result.ok) return { status: "error", message: result.error.message, profile };
  return { status: "preview", profile, fileName: file.name, csvText, preview: result.value, useStatusColumn };
}
