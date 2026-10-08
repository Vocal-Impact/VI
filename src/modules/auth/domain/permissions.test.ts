import { describe, expect, it } from "vitest";
import { effectiveRole, hasPermission, PERMISSIONS } from "./permissions";

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

describe("alumni access", () => {
  it("narrows member and committee logins of alumni; admins stay admins", () => {
    expect(effectiveRole("MEMBER", "ALUMNI")).toBe("ALUMNI");
    expect(effectiveRole("COMMITTEE", "ALUMNI")).toBe("ALUMNI_COMMITTEE");
    expect(effectiveRole("ADMIN", "ALUMNI")).toBe("ADMIN");
    expect(effectiveRole("COMMITTEE", "ACTIVE")).toBe("COMMITTEE");
    expect(effectiveRole("MEMBER", null)).toBe("MEMBER");
  });

  it("lets alumni see the dashboard and birthdays and reply to alumni practices only", () => {
    expect(hasPermission("ALUMNI", "birthdays:read")).toBe(true);
    expect(hasPermission("ALUMNI", "practices:read")).toBe(true);
    expect(hasPermission("ALUMNI", "practices:alumni-rsvp")).toBe(true);
    expect(hasPermission("ALUMNI", "practices:rsvp")).toBe(false);
    expect(hasPermission("ALUMNI", "members:read")).toBe(false);
    expect(hasPermission("ALUMNI", "practices:alumni-manage")).toBe(false);
  });

  it("lets alumni on the committee organise alumni practices, and nothing else", () => {
    expect(hasPermission("ALUMNI_COMMITTEE", "practices:alumni-manage")).toBe(true);
    expect(hasPermission("ALUMNI_COMMITTEE", "practices:manage")).toBe(false);
    expect(hasPermission("ALUMNI_COMMITTEE", "attendance:read")).toBe(false);
    expect(hasPermission("ALUMNI_COMMITTEE", "members:read")).toBe(false);
    expect(hasPermission("COMMITTEE", "practices:alumni-manage")).toBe(true);
    expect(hasPermission("MEMBER", "practices:alumni-rsvp")).toBe(false);
  });
});
