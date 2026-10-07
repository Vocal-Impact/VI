import { timingSafeEqual } from "node:crypto";
import { sendDueVenueRequestReminders } from "@/modules/attendance";
import { sendBirthdayReminders } from "@/modules/birthdays";
import { geocodeLocations } from "@/modules/carpool";
import { runStudyYearRollover } from "@/modules/members";
import { getEnv } from "@/shared/config/env";
import { errorMessage, logger } from "@/shared/lib/logger";

// Vercel Hobby functions may run up to 60 s; geocoding pauses ~1 s per area.
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Daily job, triggered by Vercel Cron (see vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`. Safe to call more than once a day.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // First, so birthday emails and lists already see the new academic year's levels.
    const studyYear = await runStudyYearRollover();
    const reminders = await sendBirthdayReminders();
    const venueReminders = await sendDueVenueRequestReminders();
    const geocoding = await geocodeLocations({ limit: 20 });
    logger.info("Daily job finished", { studyYear, reminders, venueReminders, geocoding });
    return Response.json({ ok: true, studyYear, reminders, venueReminders, geocoding });
  } catch (error) {
    logger.error("Daily job failed", { error: errorMessage(error) });
    return Response.json({ ok: false, error: "Daily job failed" }, { status: 500 });
  }
}
