import { describe, expect, it } from "vitest";
import { getPracticeAttendeeIds, setRsvp } from "@/modules/attendance";
import { getCarpoolOverview, saveLocationFromImport } from "@/modules/carpool";
import { prisma } from "@/shared/db/prisma";
import { todayLocal } from "@/shared/lib/clock";
import { addDays } from "@/shared/lib/dates";
import { createMember, createPractice, createUser } from "../support/factories";

async function locate(memberId: string, areaLabel: string, latitude: number, longitude: number, seats = 0) {
  await saveLocationFromImport(memberId, { areaLabel, canDrive: seats > 0, seats }, prisma);
  await prisma.memberLocation.update({ where: { memberId }, data: { latitude, longitude, geocodeStatus: "OK" } });
}

describe("lifts home for a specific practice", () => {
  it("only matches people who are going to (or were at) that practice", async () => {
    const admin = await createUser();
    const driver = await createMember({ firstName: "Driver", status: "ACTIVE" });
    const going = await createMember({ firstName: "Going", status: "ACTIVE" });
    const stayingHome = await createMember({ firstName: "Home", status: "ACTIVE" });
    const noArea = await createMember({ firstName: "NoArea", status: "ACTIVE" });
    await locate(driver.id, "Moratuwa", 6.773, 79.882, 3);
    await locate(going.id, "Dehiwala", 6.851, 79.865);
    await locate(stayingHome.id, "Mount Lavinia", 6.838, 79.866);

    const practice = await createPractice(addDays(todayLocal(), 1));
    await setRsvp({ practiceId: practice.id, memberId: driver.id, response: "GOING" });
    await setRsvp({ practiceId: practice.id, memberId: going.id, response: "GOING" });
    await setRsvp({ practiceId: practice.id, memberId: stayingHome.id, response: "NOT_GOING" });
    await setRsvp({ practiceId: practice.id, memberId: noArea.id, response: "GOING" });

    const attendeeIds = await getPracticeAttendeeIds(practice.id);
    expect([...attendeeIds].sort()).toEqual([driver.id, going.id, noArea.id].sort());

    const overview = await getCarpoolOverview({ routeProvider: null, attendeeIds });
    expect(overview.people.map((person) => person.name).sort()).toEqual(["Driver Test", "Going Test"]);
    expect(overview.attendeesWithoutLocation).toBe(1);
    expect(overview.suggestions.driverGroups[0]?.passengers.map((p) => p.id)).toEqual([going.id]);

    // Someone marked present on the day counts even without replying.
    await prisma.attendance.create({
      data: { practiceId: practice.id, memberId: stayingHome.id, markedById: admin.id },
    });
    expect((await getPracticeAttendeeIds(practice.id)).has(stayingHome.id)).toBe(true);

    // Without a practice, everyone with a location is considered.
    expect((await getCarpoolOverview({ routeProvider: null })).people).toHaveLength(3);
  });
});
