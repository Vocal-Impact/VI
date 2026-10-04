import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { err, ok, type Result } from "@/shared/lib/result";
import { ACCESS_LEVELS, accessLevelOf, type AccessLevel } from "../domain/access";
import { updateUser } from "./users";

/**
 * Access & roles: committee/admin logins are attached to choir member records
 * (User.memberId), so members can be promoted and demoted over the years.
 */

export const accessFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  level: z.enum(["ALL", ...ACCESS_LEVELS, "WITH_ACCESS"]).optional(),
});

export type AccessFilter = z.infer<typeof accessFilterSchema>;

const userSelect = {
  id: true,
  role: true,
  active: true,
  receivesBirthdayReminders: true,
  accounts: { select: { providerId: true } },
} satisfies Prisma.UserSelect;

export async function listMemberAccess(filter: AccessFilter = {}) {
  const q = filter.q?.trim();
  const members = await prisma.member.findMany({
    where: {
      deletedAt: null,
      OR: q
        ? [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { studentId: { contains: q, mode: "insensitive" } },
          ]
        : undefined,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      studentId: true,
      voiceType: true,
      status: true,
      user: { select: userSelect },
    },
  });

  const rows = members.map((member) => ({
    ...member,
    level: accessLevelOf(member.user),
    hasSignedIn: (member.user?.accounts.length ?? 0) > 0,
  }));

  const level = filter.level ?? "ALL";
  const filtered =
    level === "ALL"
      ? rows
      : level === "WITH_ACCESS"
        ? rows.filter((row) => row.level !== "NONE")
        : rows.filter((row) => row.level === level);

  // People with access first (admins, then committee), then everyone else.
  const rank: Record<AccessLevel, number> = { ADMIN: 0, COMMITTEE: 1, NONE: 2 };
  return filtered.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Logins that are not attached to a choir member (advisors, the local dev admin…). */
export async function listUnlinkedUsers() {
  return prisma.user.findMany({
    where: { memberId: null },
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    select: { ...userSelect, name: true, email: true },
  });
}

export async function countAccessLevels(): Promise<Record<"ADMIN" | "COMMITTEE", number>> {
  const [admins, committee] = await Promise.all([
    prisma.user.count({ where: { active: true, role: "ADMIN" } }),
    prisma.user.count({ where: { active: true, role: "COMMITTEE" } }),
  ]);
  return { ADMIN: admins, COMMITTEE: committee };
}

const setAccessSchema = z.object({
  memberId: z.uuid(),
  level: z.enum(ACCESS_LEVELS),
  receivesBirthdayReminders: z.boolean(),
});

/**
 * Grants, changes or removes a member's app access. Granting creates a login
 * from the member's IIT email (or links an existing login with that email);
 * "NONE" disables the login but keeps it for the audit trail.
 */
export async function setMemberAccess(raw: unknown, actorId: string): Promise<Result<{ level: AccessLevel }>> {
  const parsed = setAccessSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION", "Invalid access change");
  const { memberId, level, receivesBirthdayReminders } = parsed.data;

  const member = await prisma.member.findUnique({ where: { id: memberId }, include: { user: true } });
  if (!member || member.deletedAt) return err("NOT_FOUND", "Member not found");

  const byEmail = member.user ? null : await prisma.user.findUnique({ where: { email: member.email } });
  if (byEmail?.memberId && byEmail.memberId !== memberId) {
    return err("CONFLICT", "This member's email is already used by a login linked to another member");
  }
  const existing = member.user ?? byEmail;
  if (existing?.id === actorId) return err("FORBIDDEN", "You can't change your own access. Ask another admin.");

  if (level === "NONE") {
    if (!existing || !existing.active) return ok({ level });
    const result = await updateUser(
      { userId: existing.id, role: existing.role, active: false, receivesBirthdayReminders: false },
      actorId,
    );
    return result.ok ? ok({ level }) : result;
  }

  if (!existing) {
    const id = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id,
          name: `${member.firstName} ${member.lastName}`,
          email: member.email,
          role: level,
          emailVerified: true,
          active: true,
          receivesBirthdayReminders,
          memberId,
        },
      });
      await writeAuditLog(
        { actorId, action: "access.grant", entity: "member", entityId: memberId, diff: { level } },
        tx,
      );
    });
    return ok({ level });
  }

  if (!existing.memberId) {
    await prisma.user.update({ where: { id: existing.id }, data: { memberId } });
  }
  const result = await updateUser(
    { userId: existing.id, role: level, active: true, receivesBirthdayReminders },
    actorId,
  );
  if (!result.ok) return result;
  await writeAuditLog({
    actorId,
    action: "access.change",
    entity: "member",
    entityId: memberId,
    diff: { from: accessLevelOf(existing), to: level },
  });
  return ok({ level });
}
