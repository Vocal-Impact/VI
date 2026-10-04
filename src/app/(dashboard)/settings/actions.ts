"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/modules/auth";
import { sendBirthdayReminders } from "@/modules/birthdays";
import { updateSetting } from "@/shared/settings/settings";
import type { SettingKey } from "@/shared/settings/definitions";
import { formValues, toActionState, type ActionState } from "@/shared/lib/action-state";
import { err, type Result } from "@/shared/lib/result";

function parseSettingValue(key: SettingKey, values: Record<string, string>): unknown {
  switch (key) {
    case "attendanceThreshold":
    case "inactiveAfterWeeks":
      return Number.parseInt(values.value ?? "", 10);
    case "carpoolClusterRadiusKm":
    case "carpoolMaxDetourKm":
      return Number.parseFloat(values.value ?? "");
    case "inviteMessageTemplate":
      return (values.value ?? "").replace(/\r\n/g, "\n");
    case "practiceVenue":
      return {
        name: values.name ?? "",
        latitude: Number.parseFloat(values.latitude ?? ""),
        longitude: Number.parseFloat(values.longitude ?? ""),
      };
  }
}

const KEYS: SettingKey[] = [
  "attendanceThreshold",
  "inactiveAfterWeeks",
  "inviteMessageTemplate",
  "practiceVenue",
  "carpoolClusterRadiusKm",
  "carpoolMaxDetourKm",
];

export async function updateSettingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("settings:manage");
  const values = formValues(formData);
  const key = values.key as SettingKey;
  const result: Result<unknown> = KEYS.includes(key)
    ? await updateSetting(key, parseSettingValue(key, values), user.id)
    : err("VALIDATION", "Unknown setting");
  if (result.ok) revalidatePath("/", "layout");
  return toActionState(result, "Setting saved", values);
}

export async function runBirthdayRemindersAction(): Promise<ActionState> {
  await requirePermission("settings:manage");
  const summary = await sendBirthdayReminders();
  revalidatePath("/settings/system");
  return {
    status: "success",
    message: `${summary.birthdays} birthday(s) today · ${summary.emailsSent} email(s) sent · ${summary.emailsFailed} failed · ${summary.skippedAlreadySent} already sent`,
  };
}
