import { describe, expect, it } from "vitest";
import {
  getRsvpSummary,
  listUpcomingPractices,
  schedulePractice,
  setAttendance,
  setRsvp,
  updatePractice,
} from "@/modules/attendance";
import { todayLocal } from "@/shared/lib/clock";
import { addDays } from "@/shared/lib/dates";
import { createMember, createUser } from "../support/factories";

const practice = (overrides: Record<string, string> = {}) => ({
  date: addDays(todayLocal(), 5),
  startTime: "18:00",
  endTime: "",
  title: "Practice",
  venue: "Hall",
  notes: "",
  ...overrides,
});

describe("alumni practices", () => {
  it("only alumni see and reply to them; alumni see choir practices but can't reply", async () => {
    const organiser = await createUser({ role: "COMMITTEE" });
    const singer = await createMember({ firstName: "Singer", status: "ACTIVE" });
    const alumnus = await createMember({ firstName: "Alumnus", status: "ALUMNI" });

    const choir = await schedulePractice(practice({ title: "Choir practice" }), organiser.id);
    const guest = await schedulePractice(practice({ title: "Guest performance", audience: "ALUMNI" }), organiser.id);
    if (!choir.ok || !guest.ok) throw new Error("scheduling failed");

    // Lists: choir practices by default, alumni practices only when asked.
    expect((await listUpcomingPractices()).map((p) => p.title)).toEqual(["Choir practice"]);
    expect((await listUpcomingPractices({ audience: "ALUMNI" })).map((p) => p.title)).toEqual(["Guest performance"]);

    // Replies: each to their own kind of practice.
    expect((await setRsvp({ practiceId: guest.value.id, memberId: alumnus.id, response: "GOING" })).ok).toBe(true);
    const singerToGuest = await setRsvp({ practiceId: guest.value.id, memberId: singer.id, response: "GOING" });
    expect(!singerToGuest.ok && singerToGuest.error.message).toBe("This practice is for alumni");
    const alumnusToChoir = await setRsvp({ practiceId: choir.value.id, memberId: alumnus.id, response: "GOING" });
    expect(!alumnusToChoir.ok && alumnusToChoir.error.message).toBe("Alumni can't reply to choir practices");
    expect((await setRsvp({ practiceId: choir.value.id, memberId: singer.id, response: "GOING" })).ok).toBe(true);

    // Who's expected to reply: alumni for the alumni practice.
    const summary = await getRsvpSummary(guest.value.id);
    expect(summary.going.map((p) => p.name)).toEqual(["Alumnus Test"]);
    expect(summary.noResponse).toEqual([]);
    expect((await listUpcomingPractices({ audience: "ALUMNI" }))[0]?.counts).toMatchObject({ going: 1 });
  });

  it("keeps the audience when edited, and takes no attendance", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const member = await createMember({ status: "ACTIVE" });
    const guest = await schedulePractice(
      practice({ date: todayLocal(), title: "Guest performance", audience: "ALUMNI" }),
      admin.id,
    );
    if (!guest.ok) throw new Error("scheduling failed");

    await updatePractice(
      guest.value.id,
      practice({ date: todayLocal(), title: "Renamed", audience: "MEMBERS" }),
      admin.id,
    );
    expect((await listUpcomingPractices({ audience: "ALUMNI" })).map((p) => p.title)).toEqual(["Renamed"]);

    const marked = await setAttendance({ practiceId: guest.value.id, memberId: member.id, present: true }, admin);
    expect(!marked.ok && marked.error.message).toBe("Attendance isn't taken at alumni practices");
  });
});
