import "server-only";
import type { Practice } from "@/generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { todayLocal } from "@/shared/lib/clock";
import { fromIsoDate, toIsoDate } from "@/shared/lib/dates";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import { getSettings } from "@/shared/settings/settings";
import { canRsvp, countRsvps, type RsvpCounts, type RsvpResponse } from "../domain/practice";
import { practiceInputSchema, rsvpSchema } from "../schemas";

/** Members expected at practice (and asked to RSVP). */
const EXPECTED_STATUSES = ["PROSPECTIVE", "ACTIVE"] as const;

export interface PracticeView {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  venue: string | null;
  notes: string | null;
  status: "SCHEDULED" | "CANCELLED";
}

function toView(practice: Practice): PracticeView {
  return {
    id: practice.id,
    date: toIsoDate(practice.date),
    startTime: practice.startTime,
    endTime: practice.endTime,
    title: practice.title,
    venue: practice.venue,
    notes: practice.notes,
    status: practice.status,
  };
}

async function expectedMemberIds(): Promise<Set<string>> {
  const members = await prisma.member.findMany({
    where: { deletedAt: null, status: { in: [...EXPECTED_STATUSES] } },
    select: { id: true },
  });
  return new Set(members.map((member) => member.id));
}

// ─── Queries ─────────────────────────────────────────────────────────────

/** Practices from today onwards, soonest first, with RSVP counts. */
export async function listUpcomingPractices(options: { take?: number; includeCancelled?: boolean } = {}) {
  const [practices, expected] = await Promise.all([
    prisma.practice.findMany({
      where: {
        date: { gte: fromIsoDate(todayLocal()) },
        status: options.includeCancelled ? undefined : "SCHEDULED",
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: options.take ?? 10,
      include: { rsvps: { select: { memberId: true, response: true } } },
    }),
    expectedMemberIds(),
  ]);
  return practices.map((practice) => ({ ...toView(practice), counts: countRsvps(practice.rsvps, expected) }));
}

/** Past practices, most recent first, with attendance counts. */
export async function listPastPractices(take = 30) {
  const practices = await prisma.practice.findMany({
    where: { date: { lt: fromIsoDate(todayLocal()) } },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
    take,
    include: { _count: { select: { attendances: true } } },
  });
  return practices.map((practice) => ({ ...toView(practice), attended: practice._count.attendances }));
}

export async function getPractice(id: string): Promise<PracticeView | null> {
  const practice = await prisma.practice.findUnique({ where: { id } });
  return practice ? toView(practice) : null;
}

/** Today's scheduled (not cancelled) practice, if any — the only one attendance can be started for. */
export async function getTodaysPractice() {
  const practice = await prisma.practice.findFirst({
    where: { date: fromIsoDate(todayLocal()), status: "SCHEDULED" },
    orderBy: { startTime: "asc" },
    include: { _count: { select: { attendances: true } } },
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

/** Who said they're coming, who can't, and who hasn't answered. */
export async function getRsvpSummary(practiceId: string): Promise<RsvpSummary> {
  const [members, rsvps] = await Promise.all([
    prisma.member.findMany({
      where: { deletedAt: null, status: { in: [...EXPECTED_STATUSES] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, voiceType: true },
    }),
    prisma.practiceRsvp.findMany({ where: { practiceId }, orderBy: { updatedAt: "asc" } }),
  ]);
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

/** Admins and committee schedule practices; members see them on their dashboard. */
export async function schedulePractice(raw: unknown, actorId: string): Promise<Result<{ id: string }>> {
  const parsed = practiceInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const venue = parsed.data.venue ?? (await getSettings()).practiceVenue.name;

  const practice = await prisma.$transaction(async (tx) => {
    const created = await tx.practice.create({
      data: { ...parsed.data, date: fromIsoDate(parsed.data.date), venue, createdById: actorId },
    });
    await writeAuditLog(
      {
        actorId,
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

export async function updatePractice(id: string, raw: unknown, actorId: string): Promise<Result<null>> {
  const parsed = practiceInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const current = await prisma.practice.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "Practice not found");

  await prisma.$transaction(async (tx) => {
    await tx.practice.update({ where: { id }, data: { ...parsed.data, date: fromIsoDate(parsed.data.date) } });
    await writeAuditLog(
      {
        actorId,
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

  const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
  if (!practice) return err("NOT_FOUND", "Practice not found");
  if (!canRsvp({ date: toIsoDate(practice.date), status: practice.status }, todayLocal())) {
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
