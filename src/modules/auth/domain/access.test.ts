import { describe, expect, it } from "vitest";
import { accessLevelOf, canMemberSignIn } from "./access";

describe("accessLevelOf", () => {
  it("maps active logins to their access level", () => {
    expect(accessLevelOf({ role: "ADMIN", active: true })).toBe("ADMIN");
    expect(accessLevelOf({ role: "COMMITTEE", active: true })).toBe("COMMITTEE");
  });

  it("treats no login, disabled logins and member logins as no committee access", () => {
    expect(accessLevelOf(null)).toBe("NONE");
    expect(accessLevelOf(undefined)).toBe("NONE");
    expect(accessLevelOf({ role: "ADMIN", active: false })).toBe("NONE");
    expect(accessLevelOf({ role: "MEMBER", active: true })).toBe("NONE");
  });
});

describe("canMemberSignIn", () => {
  it("lets members and alumni sign in, but not removed members", () => {
    expect(canMemberSignIn({ status: "PROSPECTIVE", deletedAt: null })).toBe(true);
    expect(canMemberSignIn({ status: "ACTIVE", deletedAt: null })).toBe(true);
    expect(canMemberSignIn({ status: "INACTIVE", deletedAt: null })).toBe(true);
    expect(canMemberSignIn({ status: "ALUMNI", deletedAt: null })).toBe(true);
    expect(canMemberSignIn({ status: "ACTIVE", deletedAt: new Date() })).toBe(false);
    expect(canMemberSignIn(null)).toBe(false);
  });
});
