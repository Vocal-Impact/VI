import type { IsoDate } from "@/shared/lib/dates";

/**
 * Practice scheduling and RSVP rules. Pure and client-safe.
 * Times are local Sri Lanka times stored as "HH:mm".
 */

export const PRACTICE_STATUSES = ["SCHEDULED", "CANCELLED"] as const;
export type PracticeStatus = (typeof PRACTICE_STATUSES)[number];

export const RSVP_RESPONSES = ["GOING", "NOT_GOING"] as const;
export type RsvpResponse = (typeof RSVP_RESPONSES)[number];

export const RSVP_LABELS: Record<RsvpResponse, string> = {
  GOING: "Going",
  NOT_GOING: "Can't make it",
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME.test(value);
}

/** "18:30" → "6:30 PM". */
export function formatTime(value: string): string {
  const match = TIME.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return "Time to be confirmed";
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}

interface PracticeLike {
  date: IsoDate;
  status: PracticeStatus | string;
}

/**
 * Attendance can only be taken for a scheduled (not cancelled) practice, on its
 * day. Admins may also correct past practices; nobody can mark future ones.
 */
export function canTakeAttendance(role: string, practice: PracticeLike, today: IsoDate): boolean {
  if (practice.status === "CANCELLED") return false;
  if (practice.date === today) return true;
  return role === "ADMIN" && practice.date < today;
}

/** Members can answer (and change their answer) until the practice day ends. */
export function canRsvp(practice: PracticeLike, today: IsoDate): boolean {
  return practice.status === "SCHEDULED" && practice.date >= today;
}

export interface RsvpCounts {
  going: number;
  notGoing: number;
  noResponse: number;
}

/** Counts replies among the members expected at practice. */
export function countRsvps(
  responses: ReadonlyArray<{ memberId: string; response: RsvpResponse | string }>,
  expectedMemberIds: ReadonlySet<string>,
): RsvpCounts {
  let going = 0;
  let notGoing = 0;
  const answered = new Set<string>();
  for (const { memberId, response } of responses) {
    if (!expectedMemberIds.has(memberId)) continue;
    answered.add(memberId);
    if (response === "GOING") going += 1;
    else notGoing += 1;
  }
  return { going, notGoing, noResponse: expectedMemberIds.size - answered.size };
}

/** Who a practice is for: the current choir, or alumni (guest performances). */
export const PRACTICE_AUDIENCES = ["MEMBERS", "ALUMNI"] as const;
export type PracticeAudience = (typeof PRACTICE_AUDIENCES)[number];

/** Member statuses that are asked to reply to a practice for this audience. */
export function expectedStatusesFor(audience: PracticeAudience): Array<"PROSPECTIVE" | "ACTIVE" | "ALUMNI"> {
  return audience === "ALUMNI" ? ["ALUMNI"] : ["PROSPECTIVE", "ACTIVE"];
}

/** Whether someone with this member status may reply to a practice for this audience. */
export function canReplyAs(memberStatus: string, audience: PracticeAudience): boolean {
  return audience === "ALUMNI" ? memberStatus === "ALUMNI" : memberStatus !== "ALUMNI";
}

/** The permission needed to schedule, edit or cancel a practice for this audience. */
export function managePermissionFor(audience: PracticeAudience): "practices:manage" | "practices:alumni-manage" {
  return audience === "ALUMNI" ? "practices:alumni-manage" : "practices:manage";
}
