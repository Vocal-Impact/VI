import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS } from "./permissions";

describe("RBAC", () => {
  it("gives admins every permission", () => {
    for (const permission of PERMISSIONS) expect(hasPermission("ADMIN", permission)).toBe(true);
  });

  it("lets committee run day-to-day work but not admin tasks", () => {
    expect(hasPermission("COMMITTEE", "attendance:write")).toBe(true);
    expect(hasPermission("COMMITTEE", "invites:send")).toBe(true);
    expect(hasPermission("COMMITTEE", "imports:run")).toBe(true);
    expect(hasPermission("COMMITTEE", "groups:manage")).toBe(false);
    expect(hasPermission("COMMITTEE", "members:delete")).toBe(false);
    expect(hasPermission("COMMITTEE", "users:manage")).toBe(false);
    expect(hasPermission("COMMITTEE", "invites:override-eligibility")).toBe(false);
  });

  it("keeps members away from other people's data", () => {
    expect(hasPermission("MEMBER", "members:read")).toBe(false);
    expect(hasPermission("MEMBER", "groups:read")).toBe(false);
    expect(hasPermission("MEMBER", "carpool:read")).toBe(false);
  });
});

describe("venue booking", () => {
  it("is for admins only", () => {
    expect(hasPermission("ADMIN", "venues:book")).toBe(true);
    expect(hasPermission("COMMITTEE", "venues:book")).toBe(false);
    expect(hasPermission("MEMBER", "venues:book")).toBe(false);
  });
});
