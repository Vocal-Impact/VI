import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import { createUserSchema, updateUserSchema } from "../schemas";

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      receivesBirthdayReminders: true,
      createdAt: true,
      accounts: { select: { providerId: true } },
    },
  });
}

/**
 * Adds an email to the allowlist. The user signs in later with Google; the
 * account is linked to this row because the email is marked verified (the
 * admin vouches for it).
 */
export async function createAllowlistedUser(input: unknown, actorId: string): Promise<Result<{ id: string }>> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { name, email, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return err("CONFLICT", "A user with this email already exists", { email: ["Already on the list"] });

  const id = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.user.create({ data: { id, name, email, role, emailVerified: true, active: true } });
    await writeAuditLog({ actorId, action: "user.create", entity: "user", entityId: id, diff: { email, role } }, tx);
  });
  return ok({ id });
}

export async function updateUser(input: unknown, actorId: string): Promise<Result<null>> {
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return err("VALIDATION", "Invalid input");
  const { userId, role, active, receivesBirthdayReminders } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return err("NOT_FOUND", "User not found");

  const losesAdmin = target.role === "ADMIN" && target.active && (role !== "ADMIN" || !active);
  if (losesAdmin) {
    const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
    if (activeAdmins <= 1) return err("CONFLICT", "There must always be at least one active admin");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role, active, receivesBirthdayReminders } });
    if (!active) await tx.session.deleteMany({ where: { userId } });
    await writeAuditLog(
      {
        actorId,
        action: "user.update",
        entity: "user",
        entityId: userId,
        diff: { from: { role: target.role, active: target.active }, to: { role, active, receivesBirthdayReminders } },
      },
      tx,
    );
  });
  return ok(null);
}
