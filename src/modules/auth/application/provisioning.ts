import "server-only";
import { prisma } from "@/shared/db/prisma";
import { logger } from "@/shared/lib/logger";
import { canMemberSignIn } from "../domain/access";

/**
 * Who may sign in:
 *  - anyone an admin added (Access & roles) — their login already exists;
 *  - any choir member or alumnus, with their IIT email — a MEMBER login is
 *    created on first Google sign-in and linked to their member record.
 */

/** Called before Better Auth creates a new user (first sign-in). */
export async function mayCreateLogin(email: string): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { status: true, deletedAt: true, user: { select: { id: true } } },
  });
  const allowed = canMemberSignIn(member) && !member?.user;
  if (!allowed) logger.warn("Blocked sign-in from an email that is not a current member or approved account");
  return allowed;
}

/** Called right after a new login is created: make it a MEMBER login linked to the member. */
export async function linkNewLoginToMember(userId: string, email: string): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) return;
  await prisma.user.update({
    where: { id: userId },
    data: { memberId: member.id, role: "MEMBER", name: `${member.firstName} ${member.lastName}` },
  });
}

/**
 * May this login start a session? Disabled logins never; MEMBER logins only
 * while their member record exists (not removed).
 */
export async function maySignIn(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true, member: { select: { status: true, deletedAt: true } } },
  });
  if (!user?.active) return false;
  if (user.role === "MEMBER") return canMemberSignIn(user.member);
  return true;
}
