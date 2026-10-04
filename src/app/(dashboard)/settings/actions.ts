"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/modules/auth";
import { sendBirthdayReminders } from "@/modules/birthdays";
import { brandLogoUrl, getEmailSender, isEmailDeliveryEnabled, testEmail } from "@/modules/notifications";
import { errorMessage } from "@/shared/lib/logger";
import { updateSetting } from "@/shared/settings/settings";
import type { SettingKey } from "@/shared/settings/definitions";
import { formValues, toActionState, type ActionState } from "@/shared/lib/action-state";
import { err, type Result } from "@/shared/lib/result";
import { parseCoordinates } from "@/shared/lib/coordinates";

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
    case "practiceVenue": {
      // One field, pasted straight from Google Maps: "6.8953861, 79.8556737".
      const coordinates = parseCoordinates(values.coordinates ?? "");
      return coordinates ? { name: values.name ?? "", ...coordinates } : { name: values.name ?? "" };
    }
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
  if (key === "practiceVenue" && !parseCoordinates(values.coordinates ?? "")) {
    return {
      status: "error",
      message: "Paste the coordinates as two numbers separated by a comma, e.g. 6.8953861, 79.8556737",
      values,
    };
  }
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

/** Sends a test email to the signed-in admin and reports exactly what happened. */
export async function sendTestEmailAction(): Promise<ActionState> {
  const user = await requirePermission("settings:manage");
  try {
    await getEmailSender().send(testEmail(user.email, user.name, brandLogoUrl()));
  } catch (error) {
    return { status: "error", message: `Sending failed: ${errorMessage(error)}` };
  }
  return isEmailDeliveryEnabled()
    ? { status: "success", message: `Test email sent to ${user.email}. Check your inbox (and spam).` }
    : {
        status: "success",
        message: `Development mode: the email was printed in the server terminal, not delivered to ${user.email}.`,
      };
}
