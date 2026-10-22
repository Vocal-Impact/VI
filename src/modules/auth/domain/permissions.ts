/**
 * Role-based access control. The single source of truth for "who may do what"
 * (docs/PROJECT_BLUEPRINT.md §6.2). Pure — no I/O.
 */
export const ROLES = ["ADMIN", "COMMITTEE", "MEMBER", "BATCH_LEAD"] as const;
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
  /** Schedule and manage practices for your own level (batch leads), and see who's coming. */
  "practices:level-manage",
  /** Schedule practices for members picked one by one. Admins only. */
  "practices:invite-manage",
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
  /** Take someone back out of a group they were marked as joined by mistake. Admins only. */
  "invites:undo-joined",
  "birthdays:read",
  "carpool:read",
  "carpool:write",
  /** Listen to recordings and read sheet music in the song bank. */
  "songbank:read",
  /** Add, rename, move and delete any song bank folder or file. (Section leads add their own, see song-bank.) */
  "songbank:manage",
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
  "songbank:read",
  "songbank:manage",
];

const MEMBER_PERMISSIONS: readonly Permission[] = [
  "birthdays:read",
  "practices:read",
  "practices:rsvp",
  "songbank:read",
];

/** Alumni: the dashboard and birthdays, replying to alumni practices, and the song bank (for guest performances). */
const ALUMNI_PERMISSIONS: readonly Permission[] = [
  "birthdays:read",
  "practices:read",
  "practices:alumni-rsvp",
  "songbank:read",
];

/**
 * What a signed-in person can do. The stored role (ADMIN / COMMITTEE / MEMBER / BATCH_LEAD)
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
  MEMBER: MEMBER_PERMISSIONS,
  // A member who also organises practices for their own level.
  BATCH_LEAD: [...MEMBER_PERMISSIONS, "practices:level-manage"],
  ALUMNI: ALUMNI_PERMISSIONS,
  ALUMNI_COMMITTEE: [...ALUMNI_PERMISSIONS, "practices:alumni-manage"],
};

export function hasPermission(role: AccessRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
