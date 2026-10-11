import { describe, expect, it } from "vitest";
import {
  getAttendanceChecklist,
  getRsvpSummary,
  listUpcomingPractices,
  listUpcomingPracticesFor,
  schedulePractice,
  setRsvp,
  updatePractice,
} from "@/modules/attendance";
import { todayLocal } from "@/shared/lib/clock";
import { addDays } from "@/shared/lib/dates";
import { createMember, createUser } from "../support/factories";

const practice = (overrides: Record<string, unknown> = {}) => ({
  date: addDays(todayLocal(), 5),
  startTime: "18:00",
  endTime: "",
  title: "Practice",
  venue: "Hall",
  notes: "",
  ...overrides,
});

const titles = (practices: Array<{ title: string }>) => practices.map((p) => p.title);

describe("practices for some levels", () => {
  it("only those levels see them, reply and are counted", async () => {
    const committee = await createUser({ role: "COMMITTEE" });
    const l4 = await createMember({ firstName: "Fourth", status: "ACTIVE", yearOfStudy: "L4" });
    const l5 = await createMember({ firstName: "Fifth", status: "PROSPECTIVE", yearOfStudy: "L5" });
    const l6 = await createMember({ firstName: "Sixth", status: "ACTIVE", yearOfStudy: "L6" });

    await schedulePractice(practice({ title: "Everyone" }), committee);
    const levels = await schedulePractice(
      practice({ title: "L4 and L5", audience: "LEVELS", levels: ["L4", "L5"] }),
      committee,
    );
    if (!levels.ok) throw new Error(levels.error.message);

    expect(titles(await listUpcomingPracticesFor(l4.id))).toEqual(["Everyone", "L4 and L5"]);
    expect(titles(await listUpcomingPracticesFor(l5.id))).toEqual(["Everyone", "L4 and L5"]);
    expect(titles(await listUpcomingPracticesFor(l6.id))).toEqual(["Everyone"]);

    const fromL6 = await setRsvp({ practiceId: levels.value.id, memberId: l6.id, response: "GOING" });
    expect(!fromL6.ok && fromL6.error.message).toBe("You aren't invited to this practice");
    expect((await setRsvp({ practiceId: levels.value.id, memberId: l4.id, response: "GOING" })).ok).toBe(true);

    const summary = await getRsvpSummary(levels.value.id);
    expect(summary.going.map((p) => p.name)).toEqual(["Fourth Test"]);
    expect(summary.noResponse.map((p) => p.name)).toEqual(["Fifth Test"]);
    // The committee's list counts only the invited levels.
    const listed = (await listUpcomingPractices()).find((p) => p.id === levels.value.id);
    expect(listed?.counts).toEqual({ going: 1, notGoing: 0, noResponse: 1 });
    // Attendance lists only them too.
    expect((await getAttendanceChecklist(levels.value.id)).map((e) => e.name).sort()).toEqual([
      "Fifth Test",
      "Fourth Test",
    ]);
  });

  it("needs at least one level", async () => {
    const committee = await createUser({ role: "COMMITTEE" });
    const result = await schedulePractice(practice({ audience: "LEVELS", levels: [] }), committee);
    expect(!result.ok && result.error.code).toBe("VALIDATION");
  });
});

describe("batch leads", () => {
  it("schedule and edit practices for their own level, nothing else", async () => {
    const lead = { ...(await createUser({ role: "BATCH_LEAD" })), studyLevel: "L5" as const };

    const own = await schedulePractice(practice({ audience: "LEVELS", levels: ["L5"] }), lead);
    expect(own.ok).toBe(true);
    const other = await schedulePractice(practice({ audience: "LEVELS", levels: ["L4"] }), lead);
    expect(!other.ok && other.error.message).toBe("Batch leads can only schedule practices for their own level");
    const everyone = await schedulePractice(practice(), lead);
    expect(!everyone.ok && everyone.error.code).toBe("FORBIDDEN");
    if (!own.ok) return;

    expect((await updatePractice(own.value.id, practice({ title: "Moved", levels: ["L5"] }), lead)).ok).toBe(true);
    const widened = await updatePractice(own.value.id, practice({ levels: ["L5", "L6"] }), lead);
    expect(!widened.ok && widened.error.code).toBe("FORBIDDEN");
  });
});

describe("practices for chosen members", () => {
  it("only admins schedule them, and only the people picked see them", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const committee = await createUser({ role: "COMMITTEE" });
    const picked = await createMember({ firstName: "Picked", status: "ACTIVE" });
    const alumna = await createMember({ firstName: "Alumna", status: "ALUMNI" });
    const other = await createMember({ firstName: "Other", status: "ACTIVE" });
    const input = practice({ title: "Soloists", audience: "SELECTED", memberIds: [picked.id, alumna.id] });

    const byCommittee = await schedulePractice(input, committee);
    expect(!byCommittee.ok && byCommittee.error.message).toBe("Only admins can schedule practices for chosen members");
    const scheduled = await schedulePractice(input, admin);
    if (!scheduled.ok) throw new Error(scheduled.error.message);

    expect(titles(await listUpcomingPracticesFor(picked.id))).toEqual(["Soloists"]);
    expect(titles(await listUpcomingPracticesFor(alumna.id))).toEqual(["Soloists"]);
    expect(titles(await listUpcomingPracticesFor(other.id))).toEqual([]);
    expect((await setRsvp({ practiceId: scheduled.value.id, memberId: alumna.id, response: "GOING" })).ok).toBe(true);
    const fromOther = await setRsvp({ practiceId: scheduled.value.id, memberId: other.id, response: "GOING" });
    expect(fromOther.ok).toBe(false);

    // Swap who's invited.
    await updatePractice(scheduled.value.id, { ...input, memberIds: [other.id] }, admin);
    expect(titles(await listUpcomingPracticesFor(picked.id))).toEqual([]);
    expect(titles(await listUpcomingPracticesFor(other.id))).toEqual(["Soloists"]);
    expect((await getRsvpSummary(scheduled.value.id)).noResponse.map((p) => p.name)).toEqual(["Other Test"]);
  });
});
