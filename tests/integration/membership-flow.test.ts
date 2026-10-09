import { describe, expect, it } from "vitest";
import { createMember as createMemberService, listMembers, markAddedToWhatsapp } from "@/modules/members";
import { listEligibleMembers, setAttendance } from "@/modules/attendance";
import { getInviteContext, markInviteJoined, sendInvites } from "@/modules/whatsapp-groups";
import { ConsoleEmailSender } from "@/modules/notifications";
import { prisma } from "@/shared/db/prisma";
import { todayLocal } from "@/shared/lib/clock";
import { createGroup, createMember, createPractice, createUser } from "../support/factories";

describe("new member journey: add → 3 practices → invites → joined → active", () => {
  it("runs end to end", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const committee = await createUser({ role: "COMMITTEE" });

    const created = await createMemberService(
      {
        firstName: "nethmi",
        lastName: "jayasinghe",
        studentId: "w2026100",
        yearOfStudy: "1",
        whatsappNumber: "0771230000",
        email: "Nethmi.W2026100@iit.ac.lk",
        voiceType: "SOPRANO",
        dateOfBirth: "",
      },
      committee.id,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const memberId = created.value.id;

    const newcomers = await createGroup({ name: "VI Newcomers", requiresEligibility: false });
    const main = await createGroup({ name: "VI Main", requiresEligibility: true, isMainGroup: true });

    // Before 3 practices: open group OK, gated group refused (committee can't override).
    const early = await sendInvites({ memberIds: [memberId], groupIds: [main.id], channel: "MANUAL" }, committee);
    expect(early.ok).toBe(false);
    const override = await sendInvites(
      { memberIds: [memberId], groupIds: [main.id], channel: "MANUAL", overrideEligibility: true },
      committee,
    );
    expect(override.ok).toBe(false);
    const welcome = await sendInvites(
      { memberIds: [memberId], groupIds: [newcomers.id], channel: "WHATSAPP_LINK" },
      committee,
    );
    expect(welcome.ok && welcome.value.waMeUrl).toMatch(/^https:\/\/wa\.me\/94771230000\?text=Hi%20Nethmi/);

    // Three practices.
    const practices = await Promise.all(["2026-09-10", "2026-09-17", "2026-09-24"].map(createPractice));
    for (const practice of practices) {
      // These practices are in the past, so only an admin can record them now.
      const marked = await setAttendance({ practiceId: practice.id, memberId, present: true }, admin);
      expect(marked.ok).toBe(true);
    }
    // Marking twice is harmless.
    await setAttendance({ practiceId: practices[0]!.id, memberId, present: true }, admin);
    expect(await prisma.attendance.count({ where: { memberId } })).toBe(3);

    expect((await listEligibleMembers()).map((member) => member.id)).toEqual([memberId]);

    // Now the main-group invite goes out by email.
    const before = ConsoleEmailSender.outbox.length;
    const invited = await sendInvites({ memberIds: [memberId], groupIds: [main.id], channel: "EMAIL" }, committee);
    expect(invited.ok && invited.value.sent).toBe(1);
    const email = ConsoleEmailSender.outbox.at(-1);
    expect(ConsoleEmailSender.outbox.length).toBe(before + 1);
    expect(email?.to).toBe("nethmi.w2026100@iit.ac.lk");
    expect(email?.text).toContain(main.inviteLink);

    const context = await getInviteContext([memberId]);
    expect(context.members[0]?.groupStatus).toEqual({ [newcomers.id]: "INVITED", [main.id]: "INVITED" });

    // Joining the main group makes them active.
    await markInviteJoined(memberId, main.id, committee);
    const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
    expect(member.status).toBe("ACTIVE");
    expect(member.addedToWhatsappAt).not.toBeNull();
    expect(await listEligibleMembers()).toEqual([]);

    // Marking added again is idempotent.
    expect((await markAddedToWhatsapp(memberId, admin.id)).ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityId: memberId, action: "member.added-to-whatsapp" } })).toBe(1);
  });

  it("detects duplicates when adding by hand", async () => {
    const user = await createUser();
    const existing = await createMember({ studentId: "W2026200", email: "taken@iit.ac.lk" });
    const result = await createMemberService(
      {
        firstName: "A",
        lastName: "B",
        studentId: "W2026200",
        yearOfStudy: "2",
        whatsappNumber: "0779990000",
        email: "taken@iit.ac.lk",
        voiceType: "ALTO",
      },
      user.id,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
    expect(result.error.message).toContain(existing.id);
    expect(Object.keys(result.error.fieldErrors ?? {}).sort()).toEqual(["email", "studentId"]);
  });

  it("rejects non-IIT emails", async () => {
    const user = await createUser();
    const result = await createMemberService(
      {
        firstName: "A",
        lastName: "B",
        studentId: "W1",
        yearOfStudy: "2",
        whatsappNumber: "0779990000",
        email: "a@gmail.com",
        voiceType: "ALTO",
      },
      user.id,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fieldErrors?.email?.[0]).toMatch(/iit\.ac\.lk/);
  });

  it("only lets admins unmark past practices", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const committee = await createUser({ role: "COMMITTEE" });
    const member = await createMember();
    const past = await createPractice("2026-01-15");
    const today = await createPractice(todayLocal());

    for (const practice of [past, today])
      await setAttendance({ practiceId: practice.id, memberId: member.id, present: true }, admin);

    expect((await setAttendance({ practiceId: past.id, memberId: member.id, present: false }, committee)).ok).toBe(
      false,
    );
    expect((await setAttendance({ practiceId: today.id, memberId: member.id, present: false }, committee)).ok).toBe(
      true,
    );
    expect((await setAttendance({ practiceId: past.id, memberId: member.id, present: false }, admin)).ok).toBe(true);
    expect(await prisma.attendance.count()).toBe(0);
  });
});

describe("adding a member with a starting status", () => {
  it("defaults to prospective and accepts another status (e.g. an existing active member)", async () => {
    const user = await createUser();
    const base = { firstName: "A", lastName: "B", yearOfStudy: "2", voiceType: "ALTO" };
    const plain = await createMemberService(
      { ...base, studentId: "W3000001", whatsappNumber: "0771000001", email: "a1@iit.ac.lk" },
      user.id,
    );
    const active = await createMemberService(
      { ...base, studentId: "W3000002", whatsappNumber: "0771000002", email: "a2@iit.ac.lk", status: "ACTIVE" },
      user.id,
    );
    expect(plain.ok && active.ok).toBe(true);
    if (!plain.ok || !active.ok) return;
    expect((await prisma.member.findUniqueOrThrow({ where: { id: plain.value.id } })).status).toBe("PROSPECTIVE");
    expect((await prisma.member.findUniqueOrThrow({ where: { id: active.value.id } })).status).toBe("ACTIVE");

    const bad = await createMemberService(
      { ...base, studentId: "W3000003", whatsappNumber: "0771000003", email: "a3@iit.ac.lk", status: "BOSS" },
      user.id,
    );
    expect(bad.ok).toBe(false);
  });
});

describe("members missing details", () => {
  it("lists current members without a birthday or location", async () => {
    const noBirthday = await createMember({ firstName: "NoBirthday", status: "ACTIVE" });
    const hasBirthday = await createMember({ firstName: "HasBirthday", status: "ACTIVE", dateOfBirth: "2004-05-06" });
    await createMember({ firstName: "Alumnus", status: "ALUMNI" }); // not a current member
    await prisma.memberLocation.create({
      data: { memberId: hasBirthday.id, areaLabelEncrypted: "Nugegoda", geocodeStatus: "PENDING", consentGiven: true },
    });

    const names = async (missing: "birthday" | "location" | "details") =>
      (await listMembers({ missing })).map((member) => member.firstName).sort();
    expect(await names("birthday")).toEqual(["NoBirthday"]);
    expect(await names("location")).toEqual(["NoBirthday"]);
    expect(await names("details")).toEqual(["NoBirthday"]);
    expect(noBirthday.id).toBeTruthy();
  });
});
