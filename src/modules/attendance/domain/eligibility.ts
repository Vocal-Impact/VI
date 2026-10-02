import { addDays, type IsoDate } from "@/shared/lib/dates";

/** Default number of practices a new member attends before joining the main WhatsApp groups. */
export const DEFAULT_ATTENDANCE_THRESHOLD = 3;

/**
 * A prospective member becomes eligible for the main WhatsApp groups once they
 * have attended at least `threshold` practices (blueprint §5.2).
 */
export function isEligibleForWhatsApp(status: string, attendedPracticeCount: number, threshold: number): boolean {
  return status === "PROSPECTIVE" && attendedPracticeCount >= threshold;
}

export function attendanceProgress(attendedPracticeCount: number, threshold: number): string {
  return `${Math.min(attendedPracticeCount, threshold)}/${threshold}`;
}

/**
 * True when an active member has not attended any practice within the last
 * `weeks` weeks — the "stopped coming" report.
 */
export function hasStoppedComing(
  lastAttended: IsoDate | null,
  joined: IsoDate,
  today: IsoDate,
  weeks: number,
): boolean {
  const cutoff = addDays(today, -weeks * 7);
  if (lastAttended) return lastAttended < cutoff;
  return joined < cutoff;
}

/** Committee members may only undo a mark on the practice day; admins any time. */
export function canUnmarkAttendance(role: string, practiceDate: IsoDate, today: IsoDate): boolean {
  return role === "ADMIN" || practiceDate === today;
}
