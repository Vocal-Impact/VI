import { describe, expect, it } from "vitest";
import {
  getMemberRsvps,
  getRsvpSummary,
  getTodaysPractice,
  listUpcomingPractices,
  schedulePractice,
  setAttendance,
  setPracticeCancelled,
  setRsvp,
  updatePractice,
} from "@/modules/attendance";
import { linkNewLoginToMember, mayCreateLogin, maySignIn } from "@/modules/auth";
import { prisma } from "@/shared/db/prisma";
import { todayLocal } from "@/shared/lib/clock";
import { addDays } from "@/shared/lib/dates";
import { createMember, createPractice, createUser } from "../support/factories";

const today = todayLocal();

describe("practice scheduling", () => {
  it("schedules, edits and cancels a practice", async () => {
    const committee = await createUser({ role: "COMMITTEE" });
    const date = addDays(today, 3);

    const scheduled = await schedulePractice(
      { date, startTime: "17:30", endTime: "19:30", title: "Sectionals", venue: "", notes: "Bring folders" },
      committee.id,
    );
    expect(scheduled.ok).toBe(true);
    if (!scheduled.ok) return;
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: scheduled.value.id } });
    expect(practice).toMatchObject({
      startTime: "17:30",
      endTime: "19:30",
      status: "SCHEDULED",
      notes: "Bring folders",
    });
    expect(practice.venue).toContain("IIT"); // blank venue → the usual venue from Settings

    const bad = await schedulePractice({ date, startTime: "19:00", endTime: "18:00", title: "X" }, committee.id);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.fieldErrors?.endTime?.[0]).toMatch(/after the start/);

    await updatePractice(
      scheduled.value.id,
      { date, startTime: "18:00", endTime: "", title: "Sectionals", venue: "Auditorium", notes: "" },
      committee.id,
    );
    const [updated] = await listUpcomingPractices();
    expect(updated).toMatchObject({ startTime: "18:00", endTime: null, venue: "Auditorium", notes: null });

    await setPracticeCancelled(scheduled.value.id, true, committee.id);
    expect(await listUpcomingPractices()).toEqual([]);
    expect((await listUpcomingPractices({ includeCancelled: true }))[0]?.status).toBe("CANCELLED");
    expect(await prisma.auditLog.count({ where: { entityId: scheduled.value.id } })).toBe(3);
  });

  it("only allows attendance on the scheduled day (admins may correct the past)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const committee = await createUser({ role: "COMMITTEE" });
    const member = await createMember();
    const future = await createPractice(addDays(today, 2));
    const past = await createPractice(addDays(today, -7));
    const todays = await createPractice(today);

    expect((await setAttendance({ practiceId: future.id, memberId: member.id, present: true }, admin)).ok).toBe(false);
    expect((await setAttendance({ practiceId: past.id, memberId: member.id, present: true }, committee)).ok).toBe(
      false,
    );
    expect((await setAttendance({ practiceId: past.id, memberId: member.id, present: true }, admin)).ok).toBe(true);
    expect((await setAttendance({ practiceId: todays.id, memberId: member.id, present: true }, committee)).ok).toBe(
      true,
    );

    await prisma.practice.update({ where: { id: todays.id }, data: { status: "CANCELLED" } });
    expect(await getTodaysPractice()).toBeNull();
    expect((await setAttendance({ practiceId: todays.id, memberId: member.id, present: false }, admin)).ok).toBe(false);
  });
});

describe("RSVPs", () => {
  it("records, changes and summarises who is coming", async () => {
    const amaya = await createMember({ firstName: "Amaya", status: "ACTIVE" });
    const kavindu = await createMember({ firstName: "Kavindu" });
    const hiruni = await createMember({ firstName: "Hiruni", status: "ACTIVE" });
    await createMember({ firstName: "Old", status: "ALUMNI" }); // not expected to reply
    const practice = await createPractice(addDays(today, 1));

    expect((await setRsvp({ practiceId: practice.id, memberId: amaya.id, response: "GOING" })).ok).toBe(true);
    await setRsvp({ practiceId: practice.id, memberId: kavindu.id, response: "GOING" });
    await setRsvp({ practiceId: practice.id, memberId: kavindu.id, response: "NOT_GOING" }); // changed mind

    const summary = await getRsvpSummary(practice.id);
    expect(summary.counts).toEqual({ going: 1, notGoing: 1, noResponse: 1 });
    expect(summary.going.map((p) => p.name)).toEqual(["Amaya Test"]);
    expect(summary.notGoing.map((p) => p.name)).toEqual(["Kavindu Test"]);
    expect(summary.noResponse.map((p) => p.memberId)).toEqual([hiruni.id]);
    expect(summary.going[0]?.respondedAt).toBeInstanceOf(Date);

    expect(await getMemberRsvps(kavindu.id, [practice.id])).toEqual({ [practice.id]: "NOT_GOING" });
    const [listed] = await listUpcomingPractices();
    expect(listed?.counts).toEqual(summary.counts);
  });

  it("refuses replies for past or cancelled practices", async () => {
    const member = await createMember();
    const past = await createPractice(addDays(today, -1));
    const cancelled = await createPractice(addDays(today, 5));
    await prisma.practice.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });

    expect((await setRsvp({ practiceId: past.id, memberId: member.id, response: "GOING" })).ok).toBe(false);
    expect((await setRsvp({ practiceId: cancelled.id, memberId: member.id, response: "GOING" })).ok).toBe(false);
  });
});

describe("member sign-in", () => {
  it("creates a MEMBER login for current members on first Google sign-in", async () => {
    const member = await createMember({ firstName: "Sachini", email: "sachini.w2@iit.ac.lk", status: "ACTIVE" });
    await createMember({ email: "old.alumni@iit.ac.lk", status: "ALUMNI" });

    expect(await mayCreateLogin("Sachini.W2@IIT.ac.lk")).toBe(true);
    expect(await mayCreateLogin("stranger@gmail.com")).toBe(false);
    expect(await mayCreateLogin("old.alumni@iit.ac.lk")).toBe(false);

    // Better Auth creates the row, then the after-hook links it.
    await prisma.user.create({ data: { id: "google-user", name: "From Google", email: "sachini.w2@iit.ac.lk" } });
    await linkNewLoginToMember("google-user", "sachini.w2@iit.ac.lk");
    const login = await prisma.user.findUniqueOrThrow({ where: { id: "google-user" } });
    expect(login).toMatchObject({ role: "MEMBER", memberId: member.id, name: "Sachini Test" });
    expect(await maySignIn("google-user")).toBe(true);

    // A member who already has a login doesn't get a second one.
    expect(await mayCreateLogin("sachini.w2@iit.ac.lk")).toBe(false);

    // Becoming alumni ends member sign-in; committee/admin logins are unaffected by member status.
    await prisma.member.update({ where: { id: member.id }, data: { status: "ALUMNI" } });
    expect(await maySignIn("google-user")).toBe(false);
    await prisma.user.update({ where: { id: "google-user" }, data: { role: "COMMITTEE" } });
    expect(await maySignIn("google-user")).toBe(true);
  });

  it("defaults new logins to MEMBER, never committee", async () => {
    await prisma.user.create({ data: { id: "plain", name: "Plain", email: "plain@iit.ac.lk" } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: "plain" } })).role).toBe("MEMBER");
  });
});
