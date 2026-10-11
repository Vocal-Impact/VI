import { hasPermission, type AccessRole } from "@/modules/auth/domain";
import { STUDY_LEVELS, STUDY_LEVEL_LABELS, type StudyLevel } from "@/modules/members/domain";
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

/**
 * Who a practice is for: the whole choir, some levels (batches), members
 * picked by an admin, or alumni (guest performances).
 */
export const PRACTICE_AUDIENCES = ["MEMBERS", "LEVELS", "SELECTED", "ALUMNI"] as const;
export type PracticeAudience = (typeof PRACTICE_AUDIENCES)[number];

/** Audiences of the current choir (everything but alumni practices). */
export const CHOIR_AUDIENCES = ["MEMBERS", "LEVELS", "SELECTED"] as const satisfies readonly PracticeAudience[];

export const PRACTICE_AUDIENCE_LABELS: Record<PracticeAudience, string> = {
  MEMBERS: "Everyone",
  LEVELS: "Particular levels",
  SELECTED: "Chosen members",
  ALUMNI: "Alumni",
};

/** What decides who is invited to a practice. */
export interface PracticeTarget {
  audience: PracticeAudience;
  /** LEVELS: the levels invited. */
  levels: readonly StudyLevel[];
  /** SELECTED: the members picked. */
  inviteeIds: readonly string[];
}

export interface MemberLike {
  id: string;
  status: string;
  yearOfStudy: StudyLevel | string;
}

/**
 * Whether this member is asked to a practice: sees it on their dashboard and
 * can reply. Choir practices are for prospective and active members (alumni
 * may look but don't reply); chosen-member practices only for those picked.
 */
export function isInvited(member: MemberLike, practice: PracticeTarget): boolean {
  switch (practice.audience) {
    case "ALUMNI":
      return member.status === "ALUMNI";
    case "SELECTED":
      return practice.inviteeIds.includes(member.id);
    case "LEVELS":
      return isCurrentChoir(member.status) && (practice.levels as readonly string[]).includes(member.yearOfStudy);
    case "MEMBERS":
      return isCurrentChoir(member.status);
  }
}

/** Whether a member may reply. Inactive members aren't expected but may still answer. */
export function canReplyTo(member: MemberLike, practice: PracticeTarget): boolean {
  if (practice.audience === "SELECTED") return practice.inviteeIds.includes(member.id);
  const asChoir = { ...member, status: member.status === "INACTIVE" ? "ACTIVE" : member.status };
  return isInvited(asChoir, practice);
}

function isCurrentChoir(status: string): boolean {
  return status === "PROSPECTIVE" || status === "ACTIVE";
}

/** "Everyone", "L4 and L5", "3 chosen members", "Alumni". */
export function describeAudience(practice: PracticeTarget): string {
  switch (practice.audience) {
    case "LEVELS":
      return joinWithAnd(
        STUDY_LEVELS.filter((level) => practice.levels.includes(level)).map((level) => STUDY_LEVEL_LABELS[level]),
      );
    case "SELECTED":
      return `${practice.inviteeIds.length} chosen ${practice.inviteeIds.length === 1 ? "member" : "members"}`;
    default:
      return PRACTICE_AUDIENCE_LABELS[practice.audience];
  }
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** The person scheduling or changing a practice. */
export interface PracticeOrganiser {
  role: string;
  /** Their own level, if their login belongs to a member (batch leads organise for it). */
  studyLevel?: StudyLevel | null;
}

/**
 * Who may schedule, edit or cancel a practice for this audience:
 * - everyone and particular levels: committee and admins;
 * - their own level only: batch leads;
 * - chosen members: admins;
 * - alumni: the alumni organisers.
 */
export function canManagePractice(
  organiser: PracticeOrganiser,
  practice: Pick<PracticeTarget, "audience" | "levels">,
): boolean {
  const can = (permission: Parameters<typeof hasPermission>[1]) =>
    hasPermission(organiser.role as AccessRole, permission);
  switch (practice.audience) {
    case "ALUMNI":
      return can("practices:alumni-manage");
    case "SELECTED":
      return can("practices:invite-manage");
    case "MEMBERS":
      return can("practices:manage");
    case "LEVELS":
      return (
        can("practices:manage") ||
        (can("practices:level-manage") &&
          organiser.studyLevel != null &&
          practice.levels.length === 1 &&
          practice.levels[0] === organiser.studyLevel)
      );
  }
}
