import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/shared/db/prisma";
import { getAuth } from "../infrastructure/better-auth";
import { hasPermission, type Permission, type Role } from "../domain/permissions";
import { canMemberSignIn } from "../domain/access";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** The choir member this login belongs to, if any (needed to RSVP). */
  memberId: string | null;
}

/**
 * The signed-in, active user for this request, or null. The role is always
 * read fresh from the database so role changes and deactivation apply at once.
 * Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      memberId: true,
      member: { select: { status: true, deletedAt: true } },
    },
  });
  if (!user || !user.active) return null;
  // Member logins stop working as soon as the member becomes alumni or is removed.
  if (user.role === "MEMBER" && !canMemberSignIn(user.member)) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, memberId: user.memberId };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Server-side permission gate for pages, server actions and route handlers. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user.role, permission)) redirect("/forbidden");
  return user;
}

export async function can(permission: Permission): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null && hasPermission(user.role, permission);
}
