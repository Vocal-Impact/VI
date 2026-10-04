// Public API of the auth module (server side).
export { getCurrentUser, requireUser, requirePermission, can, type SessionUser } from "./application/session";
export { listUsers, createAllowlistedUser, updateUser } from "./application/users";
export {
  listMemberAccess,
  listUnlinkedUsers,
  countAccessLevels,
  setMemberAccess,
  accessFilterSchema,
  type AccessFilter,
} from "./application/access";
export { getAuth, isGoogleSignInConfigured, isPasswordSignInEnabled } from "./infrastructure/better-auth";
export { hasPermission, ROLES, PERMISSIONS, ROLE_PERMISSIONS, type Role, type Permission } from "./domain/permissions";
export { ACCESS_LEVELS, ACCESS_LEVEL_LABELS, accessLevelOf, type AccessLevel } from "./domain/access";
