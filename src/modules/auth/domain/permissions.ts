/**
 * Role-based access control. The single source of truth for "who may do what"
 * (docs/PROJECT_BLUEPRINT.md §6.2). Pure — no I/O.
 */
export const ROLES = ["ADMIN", "COMMITTEE", "MEMBER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "members:read",
  "members:write",
  "members:delete",
  "imports:run",
  "attendance:read",
  "attendance:write",
  "practices:read",
  "practices:manage",
  "practices:rsvp",
  /** Reply to practices for alumni (guest performances). */
  "practices:alumni-rsvp",
  /** Schedule and manage practices for alumni, and see who's coming. */
  "practices:alumni-manage",
  "rsvps:read",
  /** Ask the IIT administration for a venue and track the booking. Admins only. */
  "venues:book",
  "groups:read",
  "groups:manage",
  "invites:send",
  "invites:override-eligibility",
  "birthdays:read",
  "carpool:read",
  "carpool:write",
  "users:manage",
  "settings:manage",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const COMMITTEE_PERMISSIONS: readonly Permission[] = [
  "members:read",
  "members:write",
  "imports:run",
  "attendance:read",
  "attendance:write",
  "practices:read",
  "practices:manage",
  "practices:rsvp",
  "practices:alumni-manage",
  "rsvps:read",
  "groups:read",
  "invites:send",
  "birthdays:read",
  "carpool:read",
  "carpool:write",
];

/** Alumni: the dashboard and birthdays, and replying to alumni practices. */
const ALUMNI_PERMISSIONS: readonly Permission[] = ["birthdays:read", "practices:read", "practices:alumni-rsvp"];

/**
 * What a signed-in person can do. The stored role (ADMIN / COMMITTEE / MEMBER)
 * plus two that apply while the linked member is alumni: ALUMNI, and
 * ALUMNI_COMMITTEE for alumni who are on the committee (they organise alumni
 * practices, nothing else). Admins stay admins.
 */
export const ACCESS_ROLES = [...ROLES, "ALUMNI", "ALUMNI_COMMITTEE"] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

export function effectiveRole(role: Role, memberStatus: string | null | undefined): AccessRole {
  if (role === "ADMIN" || memberStatus !== "ALUMNI") return role;
  return role === "COMMITTEE" ? "ALUMNI_COMMITTEE" : "ALUMNI";
}

export const ROLE_PERMISSIONS: Readonly<Record<AccessRole, readonly Permission[]>> = {
  ADMIN: PERMISSIONS,
  COMMITTEE: COMMITTEE_PERMISSIONS,
  // Choir members: see practices and say whether they're coming. Nothing else.
  MEMBER: ["birthdays:read", "practices:read", "practices:rsvp"],
  ALUMNI: ALUMNI_PERMISSIONS,
  ALUMNI_COMMITTEE: [...ALUMNI_PERMISSIONS, "practices:alumni-manage"],
};

export function hasPermission(role: AccessRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
