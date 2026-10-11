import "server-only";
import type { Practice } from "@/generated/prisma/client";
import type { StudyLevel } from "@/modules/members/domain";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { todayLocal } from "@/shared/lib/clock";
import { fromIsoDate, toIsoDate } from "@/shared/lib/dates";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import { getSettings } from "@/shared/settings/settings";
import {
  canManagePractice,
  canReplyTo,
  canRsvp,
  CHOIR_AUDIENCES,
  countRsvps,
  isInvited,
  type MemberLike,
  type PracticeAudience,
  type PracticeOrganiser,
  type PracticeTarget,
  type RsvpCounts,
  type RsvpResponse,
} from "../domain/practice";
import { practiceInputSchema, rsvpSchema } from "../schemas";

export interface PracticeView {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  venue: string | null;
  notes: string | null;
  status: "SCHEDULED" | "CANCELLED";
  /** Everyone, some levels, chosen members, or alumni. */
  audience: PracticeAudience;
  /** LEVELS: the levels invited. */
  levels: StudyLevel[];
  /** SELECTED: the members invited. */
  inviteeIds: string[];
  /** ISO timestamps: request to the IIT administration sent / venue confirmed. */
  venueRequestedAt: string | null;
  venueConfirmedAt: string | null;
  /** When the admins were emailed the "book a venue" reminder. */
  venueReminderSentAt: string | null;
}

type PracticeRow = Practice & { invitees: Array<{ memberId: string }> };

/** Load with every practice, so we know who it's for. */
const withInvitees = { invitees: { select: { memberId: true } } } as const;

function toView(practice: PracticeRow): PracticeView {
  return {
    id: practice.id,
    date: toIsoDate(practice.date),
    startTime: practice.startTime,
    endTime: practice.endTime,
    title: practice.title,
    venue: practice.venue,
    notes: practice.notes,
    status: practice.status,
    audience: practice.audience,
    levels: practice.levels,
    inviteeIds: practice.invitees.map((invitee) => invitee.memberId),
    venueRequestedAt: practice.venueRequestedAt?.toISOString() ?? null,
    venueConfirmedAt: practice.venueConfirmedAt?.toISOString() ?? null,
    venueReminderSentAt: practice.venueReminderSentAt?.toISOString() ?? null,
  };
}

/** Everyone who could be invited to something (not removed), to work out each practice's invitees. */
async function loadMembers(): Promise<MemberLike[]> {
  return prisma.member.findMany({
    where: { deletedAt: null },
    select: { id: true, status: true, yearOfStudy: true },
  });
}

function invitedIds(members: readonly MemberLike[], practice: PracticeTarget): Set<string> {
  return new Set(members.filter((member) => isInvited(member, practice)).map((member) => member.id));
}

// ─── Queries ─────────────────────────────────────────────────────────────

interface ListOptions {
  take?: number;
  includeCancelled?: boolean;
  /** Which practices: choir practices of every kind (default), or e.g. ["ALUMNI"]. */
  audiences?: readonly PracticeAudience[];
  /** Only practices for exactly these levels (a batch lead's own practices). */
  levels?: StudyLevel[];
}

/** Practices from today onwards, soonest first, with RSVP counts among the people invited. */
export async function listUpcomingPractices(options: ListOptions = {}) {
  const [practices, members] = await Promise.all([
    prisma.practice.findMany({
      where: {
        date: { gte: fromIsoDate(todayLocal()) },
        status: options.includeCancelled ? undefined : "SCHEDULED",
        audience: { in: [...(options.audiences ?? CHOIR_AUDIENCES)] },
        ...(options.levels ? { levels: { equals: options.levels } } : {}),
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: options.take ?? 10,
      include: { ...withInvitees, rsvps: { select: { memberId: true, response: true } } },
    }),
    loadMembers(),
  ]);
  return practices.map((practice) => {
    const view = toView(practice);
    return { ...view, counts: countRsvps(practice.rsvps, invitedIds(members, view)) };
  });
}

/**
 * The upcoming practices one member is asked to: whole-choir practices, their
 * level's, ones they were picked for, and alumni practices for alumni.
 */
export async function listUpcomingPracticesFor(memberId: string, options: { take?: number } = {}) {
  const member = await getInviteProfile(memberId);
  if (!member) return [];
  const [practices, members] = await Promise.all([
    prisma.practice.findMany({
      where: {
        date: { gte: fromIsoDate(todayLocal()) },
        OR: [
          { audience: "MEMBERS" },
          { audience: "ALUMNI" },
          { audience: "LEVELS", levels: { has: member.yearOfStudy as StudyLevel } },
          { audience: "SELECTED", invitees: { some: { memberId } } },
        ],
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: { ...withInvitees, rsvps: { select: { memberId: true, response: true } } },
    }),
    loadMembers(),
  ]);
  return practices
    .map((practice) => {
      const view = toView(practice);
      return { ...view, counts: countRsvps(practice.rsvps, invitedIds(members, view)) };
    })
    .filter((practice) => canReplyTo(member, practice))
    .slice(0, options.take ?? 10);
}

/** What decides which practices a member is invited to. */
export async function getInviteProfile(memberId: string): Promise<MemberLike | null> {
  return prisma.member.findUnique({
    where: { id: memberId, deletedAt: null },
    select: { id: true, status: true, yearOfStudy: true },
  });
}

/** Everyone an admin can pick for a chosen-members practice: current members first, then alumni. */
export async function listInvitableMembers() {
  const members = await prisma.member.findMany({
    where: { deletedAt: null },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, yearOfStudy: true, voiceType: true, status: true },
  });
  return [...members.filter((m) => m.status !== "ALUMNI"), ...members.filter((m) => m.status === "ALUMNI")];
}

/** Past practices, most recent first, with attendance counts. */
export async function listPastPractices(take = 30, audiences: readonly PracticeAudience[] = CHOIR_AUDIENCES) {
  const practices = await prisma.practice.findMany({
    where: { date: { lt: fromIsoDate(todayLocal()) }, audience: { in: [...audiences] } },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
    take,
    include: { ...withInvitees, _count: { select: { attendances: true } } },
  });
  return practices.map((practice) => ({ ...toView(practice), attended: practice._count.attendances }));
}

export async function getPractice(id: string): Promise<PracticeView | null> {
  const practice = await prisma.practice.findUnique({ where: { id }, include: withInvitees });
  return practice ? toView(practice) : null;
}

/** Today's scheduled (not cancelled) choir practice, if any — the only one attendance can be started for. */
export async function getTodaysPractice() {
  const practice = await prisma.practice.findFirst({
    where: { date: fromIsoDate(todayLocal()), status: "SCHEDULED", audience: { in: [...CHOIR_AUDIENCES] } },
    orderBy: { startTime: "asc" },
    include: { ...withInvitees, _count: { select: { attendances: true } } },
  });
  return practice ? { ...toView(practice), attended: practice._count.attendances } : null;
}

export interface RsvpPerson {
  memberId: string;
  name: string;
  voiceType: string;
  respondedAt: Date | null;
}

export interface RsvpSummary {
  counts: RsvpCounts;
  going: RsvpPerson[];
  notGoing: RsvpPerson[];
  noResponse: RsvpPerson[];
}

/** Who said they're coming, who can't, and who hasn't answered (among the people invited). */
export async function getRsvpSummary(practiceId: string): Promise<RsvpSummary> {
  const [practice, allMembers, rsvps] = await Promise.all([
    getPractice(practiceId),
    prisma.member.findMany({
      where: { deletedAt: null },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, voiceType: true, status: true, yearOfStudy: true },
    }),
    prisma.practiceRsvp.findMany({ where: { practiceId }, orderBy: { updatedAt: "asc" } }),
  ]);
  const members = practice ? allMembers.filter((member) => isInvited(member, practice)) : [];
  const byMember = new Map(rsvps.map((rsvp) => [rsvp.memberId, rsvp]));
  const summary: RsvpSummary = {
    counts: countRsvps(rsvps, new Set(members.map((member) => member.id))),
    going: [],
    notGoing: [],
    noResponse: [],
  };
  for (const member of members) {
    const rsvp = byMember.get(member.id);
    const person = {
      memberId: member.id,
      name: `${member.firstName} ${member.lastName}`,
      voiceType: member.voiceType,
      respondedAt: rsvp?.updatedAt ?? null,
    };
    if (!rsvp) summary.noResponse.push(person);
    else if (rsvp.response === "GOING") summary.going.push(person);
    else summary.notGoing.push(person);
  }
  return summary;
}

/** A member's own answers, keyed by practice id. */
export async function getMemberRsvps(memberId: string, practiceIds: string[]): Promise<Record<string, RsvpResponse>> {
  const rsvps = await prisma.practiceRsvp.findMany({ where: { memberId, practiceId: { in: practiceIds } } });
  return Object.fromEntries(rsvps.map((rsvp) => [rsvp.practiceId, rsvp.response]));
}

// ─── Commands ────────────────────────────────────────────────────────────

/** The person scheduling: their login id, role and (for batch leads) their level. */
export type PracticeActor = PracticeOrganiser & { id: string };

const NOT_ALLOWED: Record<PracticeAudience, string> = {
  MEMBERS: "Only the committee can schedule practices for everyone",
  LEVELS: "Batch leads can only schedule practices for their own level",
  SELECTED: "Only admins can schedule practices for chosen members",
  ALUMNI: "Only alumni organisers can schedule alumni practices",
};

/** Chosen members must exist (and not be removed). */
async function checkInvitees(memberIds: readonly string[]): Promise<Result<null>> {
  if (memberIds.length === 0) return ok(null);
  const found = await prisma.member.count({ where: { id: { in: [...memberIds] }, deletedAt: null } });
  return found === memberIds.length ? ok(null) : err("VALIDATION", "Some of the chosen members no longer exist");
}

/**
 * Committee and admins schedule practices for everyone or for some levels,
 * batch leads for their own level, admins for chosen members. The people
 * invited see it on their dashboard.
 */
export async function schedulePractice(raw: unknown, actor: PracticeActor): Promise<Result<{ id: string }>> {
  const parsed = practiceInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { memberIds, ...input } = parsed.data;
  if (!canManagePractice(actor, input)) return err("FORBIDDEN", NOT_ALLOWED[input.audience]);
  const invitees = await checkInvitees(memberIds);
  if (!invitees.ok) return invitees;
  const venue = input.venue ?? (await getSettings()).practiceVenue.name;

  const practice = await prisma.$transaction(async (tx) => {
    const created = await tx.practice.create({
      data: {
        ...input,
        date: fromIsoDate(input.date),
        venue,
        createdById: actor.id,
        invitees: { create: memberIds.map((memberId) => ({ memberId })) },
      },
    });
    await writeAuditLog(
      {
        actorId: actor.id,
        action: "practice.schedule",
        entity: "practice",
        entityId: created.id,
        diff: { ...parsed.data, venue },
      },
      tx,
    );
    return created;
  });
  return ok({ id: practice.id });
}

/** Changes the details, and who's invited (levels or chosen members). The kind of audience stays. */
export async function updatePractice(id: string, raw: unknown, actor: PracticeActor): Promise<Result<null>> {
  const current = await prisma.practice.findUnique({ where: { id }, include: withInvitees });
  if (!current) return err("NOT_FOUND", "Practice not found");
  // The audience is fixed when the practice is scheduled.
  const parsed = practiceInputSchema.safeParse({ ...(raw as object), audience: current.audience });
  if (!parsed.success) return validationError(parsed.error);
  const { memberIds, audience: _audience, ...changes } = parsed.data;
  if (!canManagePractice(actor, current) || !canManagePractice(actor, parsed.data)) {
    return err("FORBIDDEN", NOT_ALLOWED[current.audience]);
  }
  const invitees = await checkInvitees(memberIds);
  if (!invitees.ok) return invitees;

  await prisma.$transaction(async (tx) => {
    await tx.practice.update({ where: { id }, data: { ...changes, date: fromIsoDate(changes.date) } });
    if (current.audience === "SELECTED") {
      await tx.practiceInvitee.deleteMany({ where: { practiceId: id, memberId: { notIn: memberIds } } });
      await tx.practiceInvitee.createMany({
        data: memberIds.map((memberId) => ({ practiceId: id, memberId })),
        skipDuplicates: true,
      });
    }
    await writeAuditLog(
      {
        actorId: actor.id,
        action: "practice.update",
        entity: "practice",
        entityId: id,
        diff: { from: { ...toView(current) }, to: { ...parsed.data } },
      },
      tx,
    );
  });
  return ok(null);
}

export async function setPracticeCancelled(id: string, cancelled: boolean, actorId: string): Promise<Result<null>> {
  const current = await prisma.practice.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "Practice not found");
  await prisma.$transaction(async (tx) => {
    await tx.practice.update({ where: { id }, data: { status: cancelled ? "CANCELLED" : "SCHEDULED" } });
    await writeAuditLog(
      { actorId, action: cancelled ? "practice.cancel" : "practice.restore", entity: "practice", entityId: id },
      tx,
    );
  });
  return ok(null);
}

export type VenueBookingStep = "requested" | "confirmed";

/**
 * Admins track booking the venue with the IIT administration: the request was
 * sent, then the venue was confirmed (optionally naming the hall they got).
 * Undoing "sent" also undoes "confirmed".
 */
export async function setVenueBooking(
  id: string,
  input: { step: VenueBookingStep; done: boolean; venue?: string },
  actorId: string,
): Promise<Result<null>> {
  const current = await prisma.practice.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "Practice not found");
  const venue = input.venue?.trim();
  if (venue !== undefined && venue.length > 120) return err("VALIDATION", "Venue must be 120 characters or fewer");

  const now = new Date();
  const data =
    input.step === "requested"
      ? input.done
        ? { venueRequestedAt: current.venueRequestedAt ?? now }
        : { venueRequestedAt: null, venueConfirmedAt: null }
      : input.done
        ? {
            venueRequestedAt: current.venueRequestedAt ?? now,
            venueConfirmedAt: now,
            ...(venue ? { venue } : {}),
          }
        : { venueConfirmedAt: null };

  await prisma.$transaction(async (tx) => {
    await tx.practice.update({ where: { id }, data });
    await writeAuditLog(
      {
        actorId,
        action: `practice.venue-${input.step}${input.done ? "" : "-undone"}`,
        entity: "practice",
        entityId: id,
        diff: venue && input.step === "confirmed" && input.done ? { venue } : undefined,
      },
      tx,
    );
  });
  return ok(null);
}

export async function deletePractice(id: string, actorId: string): Promise<Result<null>> {
  const practice = await prisma.practice.findUnique({
    where: { id },
    include: { _count: { select: { attendances: true } } },
  });
  if (!practice) return err("NOT_FOUND", "Practice not found");
  await prisma.$transaction(async (tx) => {
    await tx.practice.delete({ where: { id } });
    await writeAuditLog(
      {
        actorId,
        action: "practice.delete",
        entity: "practice",
        entityId: id,
        diff: { date: toIsoDate(practice.date), attendances: practice._count.attendances },
      },
      tx,
    );
  });
  return ok(null);
}

/**
 * Records a member's answer. Callers pass the signed-in user's own member id —
 * nobody can answer on someone else's behalf.
 */
export async function setRsvp(raw: unknown): Promise<Result<{ response: RsvpResponse }>> {
  const parsed = rsvpSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION", "Invalid response");
  const { practiceId, memberId, response } = parsed.data;

  const [practice, member] = await Promise.all([
    getPractice(practiceId),
    prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, status: true, yearOfStudy: true, deletedAt: true },
    }),
  ]);
  if (!practice) return err("NOT_FOUND", "Practice not found");
  if (!member || member.deletedAt) return err("NOT_FOUND", "Member not found");
  if (!canReplyTo(member, practice)) {
    return err(
      "FORBIDDEN",
      practice.audience === "ALUMNI"
        ? "This practice is for alumni"
        : member.status === "ALUMNI" && practice.audience === "MEMBERS"
          ? "Alumni can't reply to choir practices"
          : "You aren't invited to this practice",
    );
  }
  if (!canRsvp(practice, todayLocal())) {
    return err(
      "FORBIDDEN",
      practice.status === "CANCELLED" ? "This practice was cancelled" : "This practice has passed",
    );
  }

  await prisma.practiceRsvp.upsert({
    where: { practiceId_memberId: { practiceId, memberId } },
    create: { practiceId, memberId, response },
    update: { response },
  });
  return ok({ response });
}

/** Who will be (or was) at a practice: said "Going" or marked present. */
export async function getPracticeAttendeeIds(practiceId: string): Promise<Set<string>> {
  const [going, present] = await Promise.all([
    prisma.practiceRsvp.findMany({ where: { practiceId, response: "GOING" }, select: { memberId: true } }),
    prisma.attendance.findMany({ where: { practiceId }, select: { memberId: true } }),
  ]);
  return new Set([...going, ...present].map((row) => row.memberId));
}
