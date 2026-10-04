import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type DbClient } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { getEnv } from "@/shared/config/env";
import { fromIsoDate, toIsoDate } from "@/shared/lib/dates";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import { toCsv } from "@/shared/lib/csv";
import { findDuplicates, type DuplicateMatch } from "../domain/duplicates";
import { formatYearOfStudy, VOICE_TYPE_LABELS, type MemberStatus, type VoiceType } from "../domain/member";
import {
  memberFilterSchema,
  memberInputSchema,
  memberStatusSchema,
  type MemberFilter,
  type MemberInput,
} from "../schemas";

const DUPLICATE_LABELS = { studentId: "student ID", email: "email", whatsappNumber: "WhatsApp number" } as const;

function whereForFilter(filter: MemberFilter, includeDeleted = false): Prisma.MemberWhereInput {
  const q = filter.q?.trim();
  return {
    deletedAt: includeDeleted ? undefined : null,
    status: filter.status,
    voiceType: filter.voiceType,
    yearOfStudy: filter.year,
    OR: q
      ? [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { studentId: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { whatsappNumber: { contains: q.replace(/\s+/g, "") } },
        ]
      : undefined,
  };
}

export function parseMemberFilter(searchParams: Record<string, string | string[] | undefined>): MemberFilter {
  const pick = (key: string) => {
    const value = searchParams[key];
    const single = Array.isArray(value) ? value[0] : value;
    return single === "" ? undefined : single;
  };
  const parsed = memberFilterSchema.safeParse({
    q: pick("q"),
    status: pick("status"),
    voiceType: pick("voiceType"),
    year: pick("year"),
  });
  return parsed.success ? parsed.data : {};
}

export async function listMembers(filter: MemberFilter = {}) {
  return prisma.member.findMany({
    where: whereForFilter(filter),
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: { _count: { select: { attendances: true } } },
  });
}

export async function countMembersByStatus(): Promise<Record<MemberStatus, number>> {
  const groups = await prisma.member.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } });
  const counts: Record<MemberStatus, number> = { PROSPECTIVE: 0, ACTIVE: 0, INACTIVE: 0, ALUMNI: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}

export async function countMissingData() {
  const [missingBirthday, missingLocation] = await Promise.all([
    prisma.member.count({ where: { deletedAt: null, status: { in: ["PROSPECTIVE", "ACTIVE"] }, dateOfBirth: null } }),
    prisma.member.count({ where: { deletedAt: null, status: { in: ["PROSPECTIVE", "ACTIVE"] }, location: null } }),
  ]);
  return { missingBirthday, missingLocation };
}

export async function getMember(id: string) {
  return prisma.member.findUnique({
    where: { id },
    include: {
      location: true,
      user: { select: { role: true, active: true } },
      attendances: { include: { practice: true }, orderBy: { practice: { date: "desc" } } },
      invites: { include: { group: true, sentBy: { select: { name: true } } }, orderBy: { sentAt: "desc" } },
    },
  });
}

/** Minimal projection used by other modules (e.g. invites, carpool). */
export async function getMembersByIds(ids: string[]) {
  return prisma.member.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      whatsappNumber: true,
      voiceType: true,
      status: true,
      addedToWhatsappAt: true,
    },
  });
}

async function duplicatesFor(
  candidate: Pick<MemberInput, "studentId" | "email" | "whatsappNumber">,
  excludeId?: string,
): Promise<DuplicateMatch[]> {
  const existing = await prisma.member.findMany({
    where: {
      OR: [
        { studentId: candidate.studentId },
        { email: candidate.email },
        { whatsappNumber: candidate.whatsappNumber },
      ],
    },
    select: { id: true, studentId: true, email: true, whatsappNumber: true },
  });
  return findDuplicates(candidate, existing, excludeId);
}

function duplicateError(matches: DuplicateMatch[]): Result<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const match of matches) {
    for (const field of match.fields)
      fieldErrors[field] = [`Another member already has this ${DUPLICATE_LABELS[field]}`];
  }
  return err("CONFLICT", `This person already exists (memberId:${matches[0]?.memberId})`, fieldErrors);
}

function toMemberData(input: MemberInput) {
  return { ...input, dateOfBirth: input.dateOfBirth ? fromIsoDate(input.dateOfBirth) : null };
}

export async function createMember(raw: unknown, actorId: string): Promise<Result<{ id: string }>> {
  const parsed = memberInputSchema(getEnv().ALLOWED_EMAIL_DOMAIN).safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const duplicates = await duplicatesFor(parsed.data);
  if (duplicates.length > 0) return duplicateError(duplicates);

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({ data: { ...toMemberData(parsed.data), source: "MANUAL" } });
    await writeAuditLog(
      { actorId, action: "member.create", entity: "member", entityId: created.id, diff: parsed.data },
      tx,
    );
    return created;
  });
  return ok({ id: member.id });
}

export async function updateMember(id: string, raw: unknown, actorId: string): Promise<Result<null>> {
  const parsed = memberInputSchema(getEnv().ALLOWED_EMAIL_DOMAIN).safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const current = await prisma.member.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "Member not found");

  const duplicates = await duplicatesFor(parsed.data, id);
  if (duplicates.length > 0) return duplicateError(duplicates);

  await prisma.$transaction(async (tx) => {
    await tx.member.update({ where: { id }, data: toMemberData(parsed.data) });
    await writeAuditLog({ actorId, action: "member.update", entity: "member", entityId: id, diff: parsed.data }, tx);
  });
  return ok(null);
}

export async function changeMemberStatus(id: string, rawStatus: unknown, actorId: string): Promise<Result<null>> {
  const status = memberStatusSchema.safeParse(rawStatus);
  if (!status.success) return err("VALIDATION", "Unknown status");
  const current = await prisma.member.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "Member not found");
  if (current.status === status.data) return ok(null);

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id },
      data: {
        status: status.data,
        addedToWhatsappAt:
          status.data === "ACTIVE" ? (current.addedToWhatsappAt ?? new Date()) : current.addedToWhatsappAt,
      },
    });
    await writeAuditLog(
      {
        actorId,
        action: "member.status",
        entity: "member",
        entityId: id,
        diff: { from: current.status, to: status.data },
      },
      tx,
    );
  });
  return ok(null);
}

/**
 * "Mark as added": the member is now in the main WhatsApp groups. Idempotent.
 * Accepts a transaction client so callers (e.g. invite "joined") stay atomic.
 */
export async function markAddedToWhatsapp(id: string, actorId: string, db: DbClient = prisma): Promise<Result<null>> {
  const current = await db.member.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "Member not found");
  if (current.status === "ACTIVE" && current.addedToWhatsappAt) return ok(null);

  await db.member.update({
    where: { id },
    data: { status: "ACTIVE", addedToWhatsappAt: current.addedToWhatsappAt ?? new Date() },
  });
  await writeAuditLog(
    {
      actorId,
      action: "member.added-to-whatsapp",
      entity: "member",
      entityId: id,
      diff: { from: current.status, to: "ACTIVE" },
    },
    db,
  );
  return ok(null);
}

export async function softDeleteMember(id: string, actorId: string): Promise<Result<null>> {
  const current = await prisma.member.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "Member not found");
  await prisma.$transaction(async (tx) => {
    await tx.member.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAuditLog({ actorId, action: "member.remove", entity: "member", entityId: id }, tx);
  });
  return ok(null);
}

export async function restoreMember(id: string, actorId: string): Promise<Result<null>> {
  await prisma.$transaction(async (tx) => {
    await tx.member.update({ where: { id }, data: { deletedAt: null } });
    await writeAuditLog({ actorId, action: "member.restore", entity: "member", entityId: id }, tx);
  });
  return ok(null);
}

/** Permanent erasure for data-removal requests (PDPA). Admin only. */
export async function hardDeleteMember(id: string, actorId: string): Promise<Result<null>> {
  const current = await prisma.member.findUnique({ where: { id }, select: { studentId: true } });
  if (!current) return err("NOT_FOUND", "Member not found");
  await prisma.$transaction(async (tx) => {
    await tx.member.delete({ where: { id } });
    // Keep the audit trail but drop the personal details it referenced.
    await tx.auditLog.updateMany({ where: { entity: "member", entityId: id }, data: { diff: { redacted: true } } });
    await writeAuditLog({ actorId, action: "member.erase", entity: "member", entityId: id }, tx);
  });
  return ok(null);
}

// ─── Import support (used by the imports module inside its transaction) ────

export interface RegistrationRow {
  firstName: string;
  lastName: string;
  studentId: string;
  yearOfStudy: number;
  whatsappNumber: string;
  email: string;
  voiceType: VoiceType;
  dateOfBirth: string | null;
}

export async function findMembersByStudentIds(studentIds: string[]) {
  return prisma.member.findMany({ where: { studentId: { in: studentIds } } });
}

export async function findMembersByEmails(emails: string[]) {
  return prisma.member.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, studentId: true },
  });
}

export async function upsertMemberFromImport(row: RegistrationRow, db: DbClient): Promise<"created" | "updated"> {
  const data = { ...row, dateOfBirth: row.dateOfBirth ? fromIsoDate(row.dateOfBirth) : undefined };
  const existing = await db.member.findUnique({ where: { studentId: row.studentId }, select: { id: true } });
  if (existing) {
    await db.member.update({ where: { id: existing.id }, data });
    return "updated";
  }
  await db.member.create({ data: { ...data, source: "CSV_IMPORT", status: "PROSPECTIVE" } });
  return "created";
}

export async function setDateOfBirth(memberId: string, dateOfBirth: string, db: DbClient): Promise<void> {
  await db.member.update({ where: { id: memberId }, data: { dateOfBirth: fromIsoDate(dateOfBirth) } });
}

// ─── Export ────────────────────────────────────────────────────────────────

export async function exportMembersCsv(filter: MemberFilter = {}): Promise<string> {
  const members = await prisma.member.findMany({
    where: whereForFilter(filter),
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: { location: true, _count: { select: { attendances: true } } },
  });
  return toCsv(
    members.map((member) => ({
      "First Name": member.firstName,
      "Last Name": member.lastName,
      "IIT Student ID": member.studentId,
      "Year of Study": formatYearOfStudy(member.yearOfStudy),
      "WhatsApp Number": member.whatsappNumber,
      "IIT Email Address": member.email,
      "Voice Type": VOICE_TYPE_LABELS[member.voiceType],
      "Date of Birth": member.dateOfBirth ? toIsoDate(member.dateOfBirth) : "",
      Status: member.status,
      "Practices Attended": member._count.attendances,
      Area: member.location?.areaLabel ?? "",
      "Added to WhatsApp": member.addedToWhatsappAt?.toISOString() ?? "",
    })),
  );
}
