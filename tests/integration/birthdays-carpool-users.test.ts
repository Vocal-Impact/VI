import { describe, expect, it } from "vitest";
import { sendBirthdayReminders } from "@/modules/birthdays";
import { geocodeLocations, getCarpoolOverview, requeueFailedGeocodes, saveLocationFromImport } from "@/modules/carpool";
import { createAllowlistedUser, updateUser } from "@/modules/auth";
import type { EmailMessage, EmailSender } from "@/modules/notifications";
import { prisma } from "@/shared/db/prisma";
import type { Clock } from "@/shared/lib/clock";
import { testCipher } from "../support/sealing";
import { createMember, createUser } from "../support/factories";

class RecordingSender implements EmailSender {
  sent: EmailMessage[] = [];
  failNext = false;
  async send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("SMTP down");
    }
    this.sent.push(message);
  }
}

// 07:00 in Colombo on 2 Oct 2026 is 01:30 UTC.
const clock: Clock = { now: () => new Date("2026-10-02T01:30:00Z") };

describe("birthday reminders", () => {
  it("emails one digest per subscriber, never twice, and retries failures", async () => {
    await createUser({ email: "on@iit.ac.lk", receivesBirthdayReminders: true });
    await createUser({ email: "off@iit.ac.lk", receivesBirthdayReminders: false });
    await createMember({ firstName: "Amaya", dateOfBirth: "2004-10-02" });
    await createMember({ firstName: "Kavindu", dateOfBirth: "2005-10-02" });
    await createMember({ firstName: "Leap", dateOfBirth: "2004-02-29" });
    await createMember({ firstName: "Gone", dateOfBirth: "2004-10-02", status: "ALUMNI" });

    const sender = new RecordingSender();
    sender.failNext = true;
    const failed = await sendBirthdayReminders({ clock, sender });
    expect(failed).toMatchObject({ birthdays: 2, recipients: 1, emailsSent: 0, emailsFailed: 1 });

    const retried = await sendBirthdayReminders({ clock, sender });
    expect(retried).toMatchObject({ emailsSent: 1, emailsFailed: 0 });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe("on@iit.ac.lk");
    expect(sender.sent[0]?.subject).toBe("🎂 2 Vocal Impact birthdays today");
    expect(sender.sent[0]?.text).toContain("turning 22");

    const again = await sendBirthdayReminders({ clock, sender });
    expect(again).toMatchObject({ emailsSent: 0, skippedAlreadySent: 2 });
    expect(sender.sent).toHaveLength(1);
    expect(await prisma.cronRun.count()).toBe(3);
  });

  it("celebrates 29 February birthdays on 28 February in non-leap years", async () => {
    await createUser({ receivesBirthdayReminders: true });
    await createMember({ firstName: "Leap", dateOfBirth: "2004-02-29" });
    const sender = new RecordingSender();
    const summary = await sendBirthdayReminders({ clock: { now: () => new Date("2027-02-28T01:30:00Z") }, sender });
    expect(summary.birthdays).toBe(1);
    expect(sender.sent[0]?.subject).toContain("Leap");
  });
});

describe("carpool locations", () => {
  it("geocodes queued areas through the cache and builds suggestions", async () => {
    const driver = await createMember({ firstName: "Driver", status: "ACTIVE" });
    const rider = await createMember({ firstName: "Rider", status: "ACTIVE" });
    const lost = await createMember({ firstName: "Lost", status: "ACTIVE" });
    await saveLocationFromImport(driver.id, { areaLabel: "Moratuwa", canDrive: true, seats: 2 }, prisma);
    await saveLocationFromImport(rider.id, { areaLabel: "Dehiwala", canDrive: false, seats: 0 }, prisma);
    await saveLocationFromImport(lost.id, { areaLabel: "Atlantis", canDrive: false, seats: 0 }, prisma);

    const lookups: string[] = [];
    const geocoder = {
      async geocode(area: string) {
        const query = area.toLowerCase();
        lookups.push(query);
        if (query.startsWith("moratuwa")) return { latitude: 6.773456, longitude: 79.882123, displayName: "Moratuwa" };
        if (query.startsWith("dehiwala")) return { latitude: 6.851, longitude: 79.865, displayName: "Dehiwala" };
        return null;
      },
    };
    const summary = await geocodeLocations({ geocoder });
    expect(summary).toMatchObject({ located: 2, notFound: 1, remaining: 0 });

    const stored = await prisma.memberLocation.findUniqueOrThrow({ where: { memberId: driver.id } });
    expect(testCipher.decrypt(stored.coordinatesEncrypted!)).toBe("6.773,79.882"); // rounded for privacy, encrypted

    // A second member in the same area reuses the cache — no new lookup.
    const neighbour = await createMember({ status: "ACTIVE" });
    await saveLocationFromImport(neighbour.id, { areaLabel: "Dehiwala", canDrive: false, seats: 0 }, prisma);
    await geocodeLocations({ geocoder });
    expect(lookups.filter((query) => query.startsWith("dehiwala"))).toHaveLength(1);

    // Coordinates pasted instead of an area are used directly, without any lookup.
    const pasted = await createMember({ firstName: "Pasted", status: "ACTIVE" });
    await saveLocationFromImport(pasted.id, { areaLabel: "6.8901234, 79.8612345", canDrive: false, seats: 0 }, prisma);
    const before = lookups.length;
    await geocodeLocations({ geocoder });
    expect(lookups.length).toBe(before);
    const pastedLocation = await prisma.memberLocation.findUniqueOrThrow({ where: { memberId: pasted.id } });
    expect([testCipher.decrypt(pastedLocation.coordinatesEncrypted!), pastedLocation.geocodeStatus]).toEqual([
      "6.89,79.861",
      "OK",
    ]);

    // "Not found" isn't cached: a retry really searches again (and can now succeed).
    const atlantisLookups = () => lookups.filter((query) => query.startsWith("atlantis")).length;
    const firstTries = atlantisLookups();
    await requeueFailedGeocodes();
    await geocodeLocations({ geocoder });
    expect(atlantisLookups()).toBe(firstTries * 2);
    await prisma.memberLocation.update({ where: { memberId: pasted.id }, data: { consentGiven: false } });

    const overview = await getCarpoolOverview({ routeProvider: null });
    expect(overview.people).toHaveLength(3);
    expect(overview.unlocated.map((entry) => entry.areaLabel)).toEqual(["Atlantis"]);
    expect(overview.suggestions.driverGroups[0]?.driver.id).toBe(driver.id);
    expect(overview.suggestions.driverGroups[0]?.passengers.map((p) => p.id).sort()).toEqual(
      [rider.id, neighbour.id].sort(),
    );
  });
});

describe("user allowlist", () => {
  it("adds users and always keeps one active admin", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const added = await createAllowlistedUser({ name: "New", email: "NEW@iit.ac.lk", role: "COMMITTEE" }, admin.id);
    expect(added.ok).toBe(true);
    expect((await createAllowlistedUser({ name: "Dup", email: "new@iit.ac.lk", role: "COMMITTEE" }, admin.id)).ok).toBe(
      false,
    );

    const demoteLastAdmin = await updateUser(
      { userId: admin.id, role: "COMMITTEE", active: true, receivesBirthdayReminders: false },
      admin.id,
    );
    expect(demoteLastAdmin.ok).toBe(false);

    if (!added.ok) return;
    await updateUser(
      { userId: added.value.id, role: "ADMIN", active: true, receivesBirthdayReminders: true },
      admin.id,
    );
    // Admins can't demote themselves, but another admin can.
    const demote = await updateUser(
      { userId: admin.id, role: "COMMITTEE", active: true, receivesBirthdayReminders: false },
      added.value.id,
    );
    expect(demote.ok).toBe(true);
  });
});
