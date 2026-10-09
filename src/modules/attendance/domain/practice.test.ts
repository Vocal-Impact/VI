import { describe, expect, it } from "vitest";
import { canRsvp, canTakeAttendance, countRsvps, formatTime, formatTimeRange, isValidTime } from "./practice";

const today = "2026-10-04";

describe("times", () => {
  it("validates 24-hour HH:mm", () => {
    expect(isValidTime("18:30")).toBe(true);
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("6:30")).toBe(false);
  });
  it("formats for people", () => {
    expect(formatTime("18:30")).toBe("6:30 PM");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTimeRange("17:30", "19:30")).toBe("5:30 PM – 7:30 PM");
    expect(formatTimeRange("17:30", null)).toBe("5:30 PM");
    expect(formatTimeRange(null, null)).toBe("Time to be confirmed");
  });
});

describe("canTakeAttendance", () => {
  const scheduled = (date: string) => ({ date, status: "SCHEDULED" });
  it("is only open on the scheduled day for committee", () => {
    expect(canTakeAttendance("COMMITTEE", scheduled(today), today)).toBe(true);
    expect(canTakeAttendance("COMMITTEE", scheduled("2026-10-03"), today)).toBe(false);
    expect(canTakeAttendance("COMMITTEE", scheduled("2026-10-05"), today)).toBe(false);
  });
  it("lets admins correct past practices but never future ones", () => {
    expect(canTakeAttendance("ADMIN", scheduled("2026-09-01"), today)).toBe(true);
    expect(canTakeAttendance("ADMIN", scheduled("2026-10-05"), today)).toBe(false);
  });
  it("is closed for cancelled practices", () => {
    expect(canTakeAttendance("ADMIN", { date: today, status: "CANCELLED" }, today)).toBe(false);
  });
});

describe("canRsvp", () => {
  it("allows replies until the practice day ends, not for cancelled practices", () => {
    expect(canRsvp({ date: "2026-10-10", status: "SCHEDULED" }, today)).toBe(true);
    expect(canRsvp({ date: today, status: "SCHEDULED" }, today)).toBe(true);
    expect(canRsvp({ date: "2026-10-03", status: "SCHEDULED" }, today)).toBe(false);
    expect(canRsvp({ date: "2026-10-10", status: "CANCELLED" }, today)).toBe(false);
  });
});

describe("countRsvps", () => {
  it("counts only expected members and works out who hasn't replied", () => {
    const expected = new Set(["a", "b", "c", "d"]);
    const counts = countRsvps(
      [
        { memberId: "a", response: "GOING" },
        { memberId: "b", response: "NOT_GOING" },
        { memberId: "c", response: "GOING" },
        { memberId: "zz", response: "GOING" }, // e.g. alumni, not expected
      ],
      expected,
    );
    expect(counts).toEqual({ going: 2, notGoing: 1, noResponse: 1 });
  });
});
