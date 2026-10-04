import { describe, expect, it } from "vitest";
import {
  buildWaMeUrl,
  canInviteToGroup,
  describeAllowedParts,
  isValidInviteLink,
  membershipStatus,
  renderInviteMessage,
  renderInviteParts,
} from "./invite";

describe("isValidInviteLink", () => {
  it("accepts WhatsApp group invite links only", () => {
    expect(isValidInviteLink("https://chat.whatsapp.com/AbCdEf1234567890")).toBe(true);
    expect(isValidInviteLink("https://chat.whatsapp.com/invite/AbCdEf1234567890")).toBe(true);
    expect(isValidInviteLink("http://chat.whatsapp.com/AbCdEf1234567890")).toBe(false);
    expect(isValidInviteLink("https://evil.example/AbCdEf1234567890")).toBe(false);
    expect(isValidInviteLink("https://chat.whatsapp.com/short")).toBe(false);
  });
});

describe("canInviteToGroup", () => {
  const gated = { requiresEligibility: true, allowedVoiceTypes: [] };
  const open = { requiresEligibility: false, allowedVoiceTypes: [] };
  const tenors = { requiresEligibility: false, allowedVoiceTypes: ["TENOR"] };
  const member = (status: string, attendedCount: number, voiceType = "ALTO") => ({ status, attendedCount, voiceType });

  it("holds back only prospective members below the practice count, only for gated groups", () => {
    expect(canInviteToGroup(member("PROSPECTIVE", 1), gated, 3)).toEqual({
      allowed: false,
      reason: "Needs 3 practices (has 1)",
      overridable: true,
    });
    expect(canInviteToGroup(member("PROSPECTIVE", 3), gated, 3).allowed).toBe(true);
    expect(canInviteToGroup(member("PROSPECTIVE", 0), open, 3).allowed).toBe(true);
  });

  it("never holds back active or inactive members for practices", () => {
    expect(canInviteToGroup(member("ACTIVE", 0), gated, 3).allowed).toBe(true);
    expect(canInviteToGroup(member("INACTIVE", 0), gated, 3).allowed).toBe(true);
  });

  it("keeps part groups to their parts, for everyone", () => {
    expect(canInviteToGroup(member("ACTIVE", 10, "TENOR"), tenors, 3).allowed).toBe(true);
    expect(canInviteToGroup(member("ACTIVE", 10, "ALTO"), tenors, 3)).toEqual({
      allowed: false,
      reason: "For Tenors only",
      overridable: true,
    });
    expect(
      canInviteToGroup(member("PROSPECTIVE", 0, "BASS"), { ...tenors, requiresEligibility: true }, 3),
    ).toMatchObject({
      allowed: false,
      reason: "For Tenors only · Needs 3 practices (has 0)",
    });
  });

  it("lets an admin override (e.g. a committee member into a part group), flagged as such", () => {
    expect(canInviteToGroup(member("ACTIVE", 0, "ALTO"), tenors, 3, true)).toEqual({ allowed: true, overridden: true });
    expect(canInviteToGroup(member("PROSPECTIVE", 0), gated, 3, true)).toEqual({ allowed: true, overridden: true });
  });
});

describe("describeAllowedParts", () => {
  it("reads naturally", () => {
    expect(describeAllowedParts([])).toBe("All parts");
    expect(describeAllowedParts(["TENOR"])).toBe("Tenors only");
    expect(describeAllowedParts(["SOPRANO", "ALTO"])).toBe("Sopranos & Altos only");
  });
});

describe("renderInviteMessage", () => {
  it("fills the placeholders with the member and one line per group", () => {
    const message = renderInviteMessage(
      "Hi {firstName} {lastName}!\n{groupList}\nBye",
      { firstName: "Amaya", lastName: "Perera" },
      [
        { name: "VI Main", inviteLink: "https://chat.whatsapp.com/A1" },
        { name: "Altos", inviteLink: "https://chat.whatsapp.com/B2" },
      ],
    );
    expect(message).toBe(
      "Hi Amaya Perera!\n• VI Main — https://chat.whatsapp.com/A1\n• Altos — https://chat.whatsapp.com/B2\nBye",
    );
  });
});

describe("buildWaMeUrl", () => {
  it("uses digits only and URL-encodes the text", () => {
    expect(buildWaMeUrl("+94771234567", "Hi & welcome\n🎶")).toBe(
      "https://wa.me/94771234567?text=Hi%20%26%20welcome%0A%F0%9F%8E%B6",
    );
  });
});

describe("membershipStatus", () => {
  it("prefers joined, otherwise the latest attempt", () => {
    const invites = [
      { groupId: "g1", status: "FAILED" as const, sentAt: "2026-01-01" },
      { groupId: "g1", status: "SENT" as const, sentAt: "2026-01-02" },
      { groupId: "g2", status: "SENT" as const, sentAt: "2026-01-01" },
      { groupId: "g2", status: "JOINED" as const, sentAt: "2026-01-01" },
      { groupId: "g3", status: "SENT" as const, sentAt: "2026-01-01" },
      { groupId: "g3", status: "FAILED" as const, sentAt: "2026-01-05" },
    ];
    expect(membershipStatus(invites, "g1")).toBe("INVITED");
    expect(membershipStatus(invites, "g2")).toBe("JOINED");
    expect(membershipStatus(invites, "g3")).toBe("FAILED");
    expect(membershipStatus(invites, "g4")).toBe("NOT_INVITED");
  });
});

describe("renderInviteParts", () => {
  it("splits the filled-in message around {groupList}", () => {
    expect(
      renderInviteParts("Hi {firstName}!\n{groupList}\nBye {lastName}", { firstName: "A", lastName: "B" }),
    ).toEqual({
      before: "Hi A!\n",
      after: "\nBye B",
    });
  });
  it("puts everything before the buttons when there is no placeholder", () => {
    expect(renderInviteParts("Hi {firstName}", { firstName: "A", lastName: "B" })).toEqual({
      before: "Hi A",
      after: "",
    });
  });
});
