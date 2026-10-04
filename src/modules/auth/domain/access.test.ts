import { describe, expect, it } from "vitest";
import { accessLevelOf } from "./access";

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
