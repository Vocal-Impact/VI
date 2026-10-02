import { describe, expect, it } from "vitest";
import { buildWaMeUrl, canInviteToGroup, isValidInviteLink, membershipStatus, renderInviteMessage } from "./invite";

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
  const gated = { requiresEligibility: true };
  const open = { requiresEligibility: false };
  it("blocks prospective members below the threshold from gated groups", () => {
    expect(canInviteToGroup({ status: "PROSPECTIVE", attendedCount: 1 }, gated, 3)).toEqual({
      allowed: false,
      reason: "Needs 3 practices (has 1)",
    });
  });
  it("allows open groups, eligible members and active members", () => {
    expect(canInviteToGroup({ status: "PROSPECTIVE", attendedCount: 0 }, open, 3).allowed).toBe(true);
    expect(canInviteToGroup({ status: "PROSPECTIVE", attendedCount: 3 }, gated, 3).allowed).toBe(true);
    expect(canInviteToGroup({ status: "ACTIVE", attendedCount: 0 }, gated, 3).allowed).toBe(true);
  });
  it("lets an admin override, flagged as such", () => {
    expect(canInviteToGroup({ status: "PROSPECTIVE", attendedCount: 0 }, gated, 3, true)).toEqual({
      allowed: true,
      overridden: true,
    });
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
