import { describe, expect, it } from "vitest";
import {
  birthdayInYear,
  birthdaysInMonth,
  daysUntilBirthday,
  isBirthdayOn,
  nextBirthday,
  turningAge,
  upcomingBirthdays,
} from "./birthday";

describe("birthdayInYear", () => {
  it("keeps normal dates", () => {
    expect(birthdayInYear("2004-10-02", 2026)).toBe("2026-10-02");
  });
  it("celebrates 29 February on 28 February in non-leap years", () => {
    expect(birthdayInYear("2004-02-29", 2026)).toBe("2026-02-28");
    expect(birthdayInYear("2004-02-29", 2028)).toBe("2028-02-29");
  });
});

describe("isBirthdayOn / nextBirthday / daysUntilBirthday", () => {
  it("handles today, later this year and next year", () => {
    expect(isBirthdayOn("2004-10-02", "2026-10-02")).toBe(true);
    expect(nextBirthday("2004-12-25", "2026-10-02")).toBe("2026-12-25");
    expect(nextBirthday("2004-01-05", "2026-10-02")).toBe("2027-01-05");
    expect(daysUntilBirthday("2004-10-05", "2026-10-02")).toBe(3);
    expect(daysUntilBirthday("2004-10-02", "2026-10-02")).toBe(0);
  });
  it("wraps across new year", () => {
    expect(daysUntilBirthday("2004-01-02", "2026-12-30")).toBe(3);
  });
  it("treats a leap-day birthday as today on 28 Feb of a non-leap year", () => {
    expect(isBirthdayOn("2004-02-29", "2027-02-28")).toBe(true);
  });
});

describe("turningAge", () => {
  it("is the age reached on that year's birthday", () => {
    expect(turningAge("2004-10-02", "2026-10-02")).toBe(22);
  });
});

describe("upcomingBirthdays / birthdaysInMonth", () => {
  const people = [
    { id: "a", dateOfBirth: "2004-10-02" },
    { id: "b", dateOfBirth: "2005-10-08" },
    { id: "c", dateOfBirth: "2003-10-20" },
    { id: "d", dateOfBirth: "2003-03-01" },
  ];
  it("returns the next N days soonest first, including today", () => {
    expect(upcomingBirthdays(people, "2026-10-02", 7).map((entry) => [entry.person.id, entry.daysUntil])).toEqual([
      ["a", 0],
      ["b", 6],
    ]);
  });
  it("lists a month's birthdays by day", () => {
    expect(birthdaysInMonth(people, 2026, 10).map((entry) => entry.person.id)).toEqual(["a", "b", "c"]);
    expect(birthdaysInMonth(people, 2026, 3).map((entry) => entry.date)).toEqual(["2026-03-01"]);
  });
});
