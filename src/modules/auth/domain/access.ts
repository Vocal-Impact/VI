import type { Role } from "./permissions";

/**
 * What a choir member can do in the app. Members are promoted to Committee or
 * Admin from the Access page; "NONE" means no login (or a disabled one).
 */
export const ACCESS_LEVELS = ["NONE", "COMMITTEE", "ADMIN"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  NONE: "No access",
  COMMITTEE: "Committee",
  ADMIN: "Admin",
};

export function accessLevelOf(user: { role: Role | string; active: boolean } | null | undefined): AccessLevel {
  if (!user || !user.active) return "NONE";
  if (user.role === "ADMIN") return "ADMIN";
  if (user.role === "COMMITTEE") return "COMMITTEE";
  // MEMBER logins are reserved for Phase 4 self-service and grant no committee access.
  return "NONE";
}
