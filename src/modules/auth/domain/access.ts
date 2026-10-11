import type { Role } from "./permissions";

/**
 * What a choir member can do in the app. Members are promoted to Batch lead,
 * Committee or Admin from the Access page; "NONE" means no login (or a disabled one).
 */
export const ACCESS_LEVELS = ["NONE", "BATCH_LEAD", "COMMITTEE", "ADMIN"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  NONE: "Member",
  BATCH_LEAD: "Batch lead",
  COMMITTEE: "Committee",
  ADMIN: "Admin",
};

export function accessLevelOf(user: { role: Role | string; active: boolean } | null | undefined): AccessLevel {
  if (!user || !user.active) return "NONE";
  if (user.role === "ADMIN") return "ADMIN";
  if (user.role === "COMMITTEE") return "COMMITTEE";
  if (user.role === "BATCH_LEAD") return "BATCH_LEAD";
  // MEMBER logins can see practices and RSVP but have no committee access.
  return "NONE";
}

/** Member statuses that may sign in (removed members may not). Alumni get limited access, see effectiveRole. */
export const MEMBER_SIGN_IN_STATUSES = ["PROSPECTIVE", "ACTIVE", "INACTIVE", "ALUMNI"] as const;

export function canMemberSignIn(member: { status: string; deletedAt: Date | null } | null | undefined): boolean {
  return (
    !!member && member.deletedAt === null && (MEMBER_SIGN_IN_STATUSES as readonly string[]).includes(member.status)
  );
}

/** Roles that belong to a choir member's own login (so they stop working when the member is removed). */
export function isMemberLogin(role: string): boolean {
  return role === "MEMBER" || role === "BATCH_LEAD";
}
