import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  normalizeName,
  normalizeStudentId,
  normalizeWhatsappNumber,
  parseDateOfBirth,
  parseVoiceType,
  parseStudyLevel,
  nextStudyLevel,
  parseMemberStatus,
  normalizeDietaryPreference,
} from "./member";
import { findDuplicates } from "./duplicates";

const value = <T>(result: { ok: true; value: T } | { ok: false; message: string }) =>
  result.ok ? result.value : undefined;

describe("normalizeName", () => {
  it("title-cases names typed in one case and collapses spaces", () => {
    expect(value(normalizeName("  nethmi   perera "))).toBe("Nethmi Perera");
    expect(value(normalizeName("KAVINDU"))).toBe("Kavindu");
    expect(value(normalizeName("anne-marie o'neil"))).toBe("Anne-Marie O'Neil");
  });
  it("keeps deliberate mixed case", () => {
    expect(value(normalizeName("McDonald"))).toBe("McDonald");
  });
  it("rejects blanks", () => {
    expect(normalizeName("   ").ok).toBe(false);
  });
});

describe("normalizeStudentId", () => {
  it("uppercases and removes spaces", () => {
    expect(value(normalizeStudentId(" w19 12345 "))).toBe("W1912345");
  });
  it("rejects junk", () => {
    expect(normalizeStudentId("??").ok).toBe(false);
  });
});

describe("parseStudyLevel", () => {
  it.each([
    ["Foundation", "FOUNDATION"],
    ["L4", "L4"],
    ["Level 5", "L5"],
    ["l6", "L6"],
    ["Placement Year", "PLACEMENT"],
    ["Industrial placement", "PLACEMENT"],
    ["1st Year", "L4"],
    ["2", "L5"],
    ["Year 3", "PLACEMENT"],
    ["Final year", "L6"],
    ["PLACEMENT", "PLACEMENT"],
    ["Done", "L6"],
    ["Graduated", "L6"],
  ])("parses %s", (input, expected) => {
    expect(value(parseStudyLevel(input))).toBe(expected);
  });
  it("rejects unknown levels", () => {
    expect(parseStudyLevel("7").ok).toBe(false);
    expect(parseStudyLevel("L7").ok).toBe(false);
    expect(parseStudyLevel("").ok).toBe(false);
  });
});

describe("parseMemberStatus", () => {
  it.each([
    ["Active", "ACTIVE"],
    ["Inactive", "INACTIVE"],
    ["New member", "PROSPECTIVE"],
    ["Prospective", "PROSPECTIVE"],
    ["Alumni", "ALUMNI"],
    ["Oldie", "ACTIVE"],
    ["Newbie", "PROSPECTIVE"],
    ["", null],
  ])("parses %s", (input, expected) => {
    expect(value(parseMemberStatus(input))).toBe(expected);
  });
  it("rejects anything else", () => {
    expect(parseMemberStatus("maybe").ok).toBe(false);
  });
});

describe("nextStudyLevel", () => {
  it("moves up one level and graduates after L6", () => {
    expect(nextStudyLevel("FOUNDATION")).toBe("L4");
    expect(nextStudyLevel("L5")).toBe("PLACEMENT");
    expect(nextStudyLevel("PLACEMENT")).toBe("L6");
    expect(nextStudyLevel("L6")).toBe("GRADUATED");
  });
});

describe("normalizeDietaryPreference", () => {
  it("keeps real answers and treats 'none' as empty", () => {
    expect(value(normalizeDietaryPreference("  Vegetarian,   no nuts "))).toBe("Vegetarian, no nuts");
    expect(value(normalizeDietaryPreference("None"))).toBeNull();
    expect(value(normalizeDietaryPreference("N/A"))).toBeNull();
    expect(value(normalizeDietaryPreference(""))).toBeNull();
    expect(normalizeDietaryPreference("x".repeat(201)).ok).toBe(false);
  });
});

describe("normalizeWhatsappNumber", () => {
  it("normalises Sri Lankan numbers to E.164", () => {
    expect(value(normalizeWhatsappNumber("077 123 4567"))).toBe("+94771234567");
    expect(value(normalizeWhatsappNumber("0771234567"))).toBe("+94771234567");
    expect(value(normalizeWhatsappNumber("+94 77 123 4567"))).toBe("+94771234567");
  });
  it("accepts international numbers", () => {
    expect(value(normalizeWhatsappNumber("+44 7911 123456"))).toBe("+447911123456");
  });
  it("rejects invalid numbers", () => {
    expect(normalizeWhatsappNumber("12345").ok).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and enforces the IIT domain", () => {
    expect(value(normalizeEmail(" Nethmi.2024@IIT.ac.lk ", "iit.ac.lk"))).toBe("nethmi.2024@iit.ac.lk");
    expect(normalizeEmail("someone@gmail.com", "iit.ac.lk").ok).toBe(false);
    expect(normalizeEmail("not-an-email", "iit.ac.lk").ok).toBe(false);
  });
  it("allows subdomains of the IIT domain", () => {
    expect(normalizeEmail("a@students.iit.ac.lk", "iit.ac.lk").ok).toBe(true);
    expect(normalizeEmail("a@fakeiit.ac.lk", "iit.ac.lk").ok).toBe(false);
  });
});

describe("parseVoiceType", () => {
  it.each([
    ["Soprano 1", "SOPRANO"],
    ["alto", "ALTO"],
    ["Mezzo-soprano", "ALTO"],
    ["Tenor", "TENOR"],
    ["Baritone", "BASS"],
    ["Not sure", "UNASSIGNED"],
    ["", "UNASSIGNED"],
  ])("%s → %s", (input, expected) => {
    expect(parseVoiceType(input)).toBe(expected);
  });
});

describe("parseDateOfBirth", () => {
  const today = "2026-10-02";
  it("accepts ISO and day-first dates", () => {
    expect(value(parseDateOfBirth("2004-03-15", today))).toBe("2004-03-15");
    expect(value(parseDateOfBirth("15/03/2004", today))).toBe("2004-03-15");
    expect(value(parseDateOfBirth("5.3.2004", today))).toBe("2004-03-05");
  });
  it("swaps day and month when the order is unambiguous", () => {
    expect(value(parseDateOfBirth("3/15/2004", today))).toBe("2004-03-15");
  });
  it("supports month-first order when configured", () => {
    expect(value(parseDateOfBirth("3/5/2004", today, "MDY"))).toBe("2004-03-05");
  });
  it("rejects impossible or implausible dates", () => {
    expect(parseDateOfBirth("31/02/2004", today).ok).toBe(false);
    expect(parseDateOfBirth("2024-01-01", today).ok).toBe(false);
    expect(parseDateOfBirth("yesterday", today).ok).toBe(false);
  });
});

describe("findDuplicates", () => {
  const existing = [
    { id: "a", studentId: "S1", email: "a@iit.ac.lk", whatsappNumber: "+94770000001" },
    { id: "b", studentId: "S2", email: "b@iit.ac.lk", whatsappNumber: "+94770000002" },
  ];
  it("reports every matching field per member", () => {
    expect(findDuplicates({ studentId: "S1", email: "b@iit.ac.lk", whatsappNumber: "+94779999999" }, existing)).toEqual(
      [
        { memberId: "a", fields: ["studentId"] },
        { memberId: "b", fields: ["email"] },
      ],
    );
  });
  it("ignores the member being edited", () => {
    expect(
      findDuplicates({ studentId: "S1", email: "a@iit.ac.lk", whatsappNumber: "+94770000001" }, existing, "a"),
    ).toEqual([]);
  });
});
