import { describe, expect, it } from "vitest";
import { attendanceProgress, canUnmarkAttendance, hasStoppedComing, isEligibleForWhatsApp } from "./eligibility";

describe("isEligibleForWhatsApp", () => {
  it("requires a prospective member with at least the threshold", () => {
    expect(isEligibleForWhatsApp("PROSPECTIVE", 2, 3)).toBe(false);
    expect(isEligibleForWhatsApp("PROSPECTIVE", 3, 3)).toBe(true);
    expect(isEligibleForWhatsApp("PROSPECTIVE", 5, 3)).toBe(true);
  });
  it("is false for members already active or inactive", () => {
    expect(isEligibleForWhatsApp("ACTIVE", 10, 3)).toBe(false);
    expect(isEligibleForWhatsApp("INACTIVE", 10, 3)).toBe(false);
  });
});

describe("attendanceProgress", () => {
  it("caps at the threshold", () => {
    expect(attendanceProgress(1, 3)).toBe("1/3");
    expect(attendanceProgress(7, 3)).toBe("3/3");
  });
});

describe("hasStoppedComing", () => {
  const today = "2026-10-02";
  it("flags members whose last practice is older than the window", () => {
    expect(hasStoppedComing("2026-08-01", "2026-01-01", today, 4)).toBe(true);
    expect(hasStoppedComing("2026-09-20", "2026-01-01", today, 4)).toBe(false);
  });
  it("gives members who never came a grace period from joining", () => {
    expect(hasStoppedComing(null, "2026-09-25", today, 4)).toBe(false);
    expect(hasStoppedComing(null, "2026-06-01", today, 4)).toBe(true);
  });
});

describe("canUnmarkAttendance", () => {
  it("lets committee unmark only on the practice day; admins any time", () => {
    expect(canUnmarkAttendance("COMMITTEE", "2026-10-02", "2026-10-02")).toBe(true);
    expect(canUnmarkAttendance("COMMITTEE", "2026-10-01", "2026-10-02")).toBe(false);
    expect(canUnmarkAttendance("ADMIN", "2026-01-01", "2026-10-02")).toBe(true);
  });
});
