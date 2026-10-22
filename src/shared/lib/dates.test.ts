import { describe, expect, it } from "vitest";
import { addDays, fromIsoDate, isIsoDate, isLeapYear, localIsoDate, localTime, toIsoDate } from "./dates";

describe("dates", () => {
  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2023-02-29")).toBe(false);
    expect(isIsoDate("2024-2-1")).toBe(false);
  });

  it("resolves the local calendar date in Asia/Colombo (UTC+5:30)", () => {
    // 19:00 UTC on 2 Oct is 00:30 on 3 Oct in Sri Lanka.
    expect(localIsoDate(new Date("2026-10-02T19:00:00Z"), "Asia/Colombo")).toBe("2026-10-03");
    expect(localIsoDate(new Date("2026-10-02T18:00:00Z"), "Asia/Colombo")).toBe("2026-10-02");
  });

  it("round-trips DATE column values", () => {
    expect(toIsoDate(fromIsoDate("2026-01-31"))).toBe("2026-01-31");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("knows leap years", () => {
    expect([2024, 2000, 1900, 2026].map(isLeapYear)).toEqual([true, true, false, false]);
  });
});

describe("localTime", () => {
  it("gives the 24-hour wall-clock time in the time zone", () => {
    // 12:15 UTC is 17:45 in Sri Lanka (UTC+5:30); midnight shows as 00, not 24.
    expect(localTime(new Date("2026-10-22T12:15:00Z"), "Asia/Colombo")).toBe("17:45");
    expect(localTime(new Date("2026-10-21T18:30:00Z"), "Asia/Colombo")).toBe("00:00");
  });
});
