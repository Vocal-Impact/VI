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
  "groups:read",
  "invites:send",
  "birthdays:read",
  "carpool:read",
  "carpool:write",
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  ADMIN: PERMISSIONS,
  COMMITTEE: COMMITTEE_PERMISSIONS,
  // Phase 4 (member self-service) will add own-profile permissions here.
  MEMBER: ["birthdays:read"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
