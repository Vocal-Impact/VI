import { describe, expect, it } from "vitest";
import {
  practicePhase,
  canManagePractice,
  canReplyTo,
  canRsvp,
  canTakeAttendance,
  countRsvps,
  describeAudience,
  formatTime,
  formatTimeRange,
  isInvited,
  isValidTime,
  type PracticeTarget,
} from "./practice";

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

describe("who a practice is for", () => {
  const everyone: PracticeTarget = { audience: "MEMBERS", levels: [], inviteeIds: [] };
  const l4AndL5: PracticeTarget = { audience: "LEVELS", levels: ["L4", "L5"], inviteeIds: [] };
  const chosen: PracticeTarget = { audience: "SELECTED", levels: [], inviteeIds: ["picked", "old-friend"] };
  const alumniOnly: PracticeTarget = { audience: "ALUMNI", levels: [], inviteeIds: [] };
  const l4 = { id: "a", status: "ACTIVE", yearOfStudy: "L4" };
  const newL6 = { id: "b", status: "PROSPECTIVE", yearOfStudy: "L6" };
  const picked = { id: "picked", status: "ACTIVE", yearOfStudy: "L6" };
  const oldFriend = { id: "old-friend", status: "ALUMNI", yearOfStudy: "L6" };
  const resting = { id: "c", status: "INACTIVE", yearOfStudy: "L4" };

  it("invites the whole choir, some levels, the people picked, or alumni", () => {
    expect([l4, newL6, picked, oldFriend].map((m) => isInvited(m, everyone))).toEqual([true, true, true, false]);
    expect([l4, newL6, picked].map((m) => isInvited(m, l4AndL5))).toEqual([true, false, false]);
    expect([l4, picked, oldFriend].map((m) => isInvited(m, chosen))).toEqual([false, true, true]);
    expect([l4, oldFriend].map((m) => isInvited(m, alumniOnly))).toEqual([false, true]);
  });

  it("lets inactive members reply to their practices without expecting them", () => {
    expect(isInvited(resting, l4AndL5)).toBe(false);
    expect(canReplyTo(resting, l4AndL5)).toBe(true);
    expect(canReplyTo(resting, chosen)).toBe(false);
    expect(canReplyTo(oldFriend, everyone)).toBe(false);
  });

  it("describes who it's for", () => {
    expect(describeAudience(l4AndL5)).toBe("L4 and L5");
    expect(describeAudience({ ...l4AndL5, levels: ["L6", "FOUNDATION", "L4"] })).toBe("Foundation, L4 and L6");
    expect(describeAudience(chosen)).toBe("2 chosen members");
    expect(describeAudience(everyone)).toBe("Everyone");
  });
});

describe("canManagePractice", () => {
  const forLevels = (...levels: Array<"L4" | "L5">) => ({ audience: "LEVELS" as const, levels });

  it("lets batch leads organise practices for their own level only", () => {
    const lead = { role: "BATCH_LEAD", studyLevel: "L4" as const };
    expect(canManagePractice(lead, forLevels("L4"))).toBe(true);
    expect(canManagePractice(lead, forLevels("L5"))).toBe(false);
    expect(canManagePractice(lead, forLevels("L4", "L5"))).toBe(false);
    expect(canManagePractice(lead, { audience: "MEMBERS", levels: [] })).toBe(false);
    expect(canManagePractice({ role: "BATCH_LEAD", studyLevel: null }, forLevels("L4"))).toBe(false);
    expect(canManagePractice({ role: "MEMBER", studyLevel: "L4" }, forLevels("L4"))).toBe(false);
  });

  it("keeps chosen-member practices to admins", () => {
    const selected = { audience: "SELECTED" as const, levels: [] };
    expect(canManagePractice({ role: "ADMIN" }, selected)).toBe(true);
    expect(canManagePractice({ role: "COMMITTEE" }, selected)).toBe(false);
    expect(canManagePractice({ role: "COMMITTEE" }, forLevels("L4", "L5"))).toBe(true);
  });
});

describe("practicePhase", () => {
  const at = (time: string) => ({ date: "2026-10-22", time });
  const practice = { date: "2026-10-22", startTime: "17:30", endTime: "19:30" };

  it("is upcoming before the start, ongoing until the end time, then ended", () => {
    expect(practicePhase(practice, at("09:00"))).toBe("UPCOMING");
    expect(practicePhase(practice, at("17:30"))).toBe("ONGOING");
    expect(practicePhase(practice, at("19:29"))).toBe("ONGOING");
    expect(practicePhase(practice, at("19:30"))).toBe("ENDED");
    expect(practicePhase(practice, at("23:59"))).toBe("ENDED");
  });

  it("goes by the date on other days", () => {
    expect(practicePhase({ ...practice, date: "2026-10-23" }, at("18:00"))).toBe("UPCOMING");
    expect(practicePhase({ ...practice, date: "2026-10-21" }, at("18:00"))).toBe("ENDED");
  });

  it("takes two hours when there's no end time, and all day when there's no start time", () => {
    const open = { ...practice, endTime: null };
    expect(practicePhase(open, at("19:29"))).toBe("ONGOING");
    expect(practicePhase(open, at("19:30"))).toBe("ENDED");
    expect(practicePhase({ ...open, startTime: "23:00" }, at("23:59"))).toBe("ONGOING");
    expect(practicePhase({ ...practice, startTime: null, endTime: null }, at("23:00"))).toBe("ONGOING");
  });
});
