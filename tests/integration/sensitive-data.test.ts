import { describe, expect, it } from "vitest";
import {
  createMember as createMemberService,
  getMember,
  listMembers,
  runStudyYearRollover,
  updateMember,
} from "@/modules/members";
import { saveMemberLocation } from "@/modules/carpool";
import { encryptExistingData } from "@/shared/crypto/encrypt-existing";
import { prisma } from "@/shared/db/prisma";
import { createMember, createUser } from "../support/factories";
import { testCipher } from "../support/sealing";

const base = {
  firstName: "Nethmi",
  lastName: "Jay",
  studentId: "W4000001",
  yearOfStudy: "L4",
  whatsappNumber: "077 123 4000",
  email: "nethmi.w4000001@iit.ac.lk",
  voiceType: "SOPRANO",
};

describe("encrypted personal data", () => {
  it("stores phone, dietary preference and location encrypted, and shows them decrypted", async () => {
    const user = await createUser();
    const created = await createMemberService({ ...base, dietaryPreference: "Vegetarian, no nuts" }, user.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;
    await saveMemberLocation(
      id,
      {
        areaLabel: "Kohuwala junction",
        consentGiven: true,
        canDrive: false,
        seats: "0",
        pin: { latitude: 6.8664, longitude: 79.8774 },
      },
      user.id,
    );

    const raw = await prisma.member.findUniqueOrThrow({ where: { id }, include: { location: true } });
    expect(raw.whatsappNumberEncrypted).toMatch(/^v1:/);
    expect(raw.dietaryPreferenceEncrypted).toMatch(/^v1:/);
    expect(raw.location?.areaLabelEncrypted).toMatch(/^v1:/);
    expect(testCipher.decrypt(raw.location!.coordinatesEncrypted!)).toBe("6.866,79.877");
    expect(JSON.stringify(raw)).not.toMatch(/1234000|Vegetarian|Kohuwala/);

    const member = await getMember(id);
    expect(member).toMatchObject({ whatsappNumber: "+94771234000", dietaryPreference: "Vegetarian, no nuts" });
    expect(member?.location).toMatchObject({ areaLabel: "Kohuwala junction", latitude: 6.866, longitude: 79.877 });

    // Search by phone number (exact match on the fingerprint), typed any way.
    expect((await listMembers({ q: "0771234000" })).map((m) => m.id)).toEqual([id]);
    expect(await listMembers({ q: "0771234999" })).toEqual([]);

    // Duplicate WhatsApp numbers are still caught.
    const clash = await createMemberService(
      { ...base, studentId: "W4000002", email: "other@iit.ac.lk", whatsappNumber: "+94 77 123 4000" },
      user.id,
    );
    expect(!clash.ok && Object.keys(clash.error.fieldErrors ?? {})).toEqual(["whatsappNumber"]);

    // Clearing the dietary preference stores nothing.
    await updateMember(id, { ...base, dietaryPreference: "none" }, user.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id } })).dietaryPreferenceEncrypted).toBeNull();

    // The audit trail never holds the plaintext.
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toMatch(/1234000|Vegetarian|Kohuwala/);
  });

  it("reads rows saved before encryption and encrypts them in place (npm run db:encrypt)", async () => {
    const user = await createUser();
    const legacy = await createMember({ firstName: "Legacy" });
    await prisma.member.update({
      where: { id: legacy.id },
      data: { whatsappNumberEncrypted: "+94775550000", whatsappNumberHash: null },
    });
    await prisma.memberLocation.create({
      data: {
        memberId: legacy.id,
        areaLabelEncrypted: "Nugegoda",
        coordinatesEncrypted: "6.87,79.888",
        geocodeStatus: "OK",
        consentGiven: true,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "member.create",
        entity: "member",
        entityId: legacy.id,
        diff: { whatsappNumber: "+94775550000", firstName: "Legacy" },
      },
    });

    expect(await getMember(legacy.id)).toMatchObject({
      whatsappNumber: "+94775550000",
      location: { areaLabel: "Nugegoda", latitude: 6.87, longitude: 79.888 },
    });
    // Duplicate check works even before the backfill.
    const clash = await createMemberService(
      { ...base, studentId: "W4000003", email: "x@iit.ac.lk", whatsappNumber: "0775550000" },
      user.id,
    );
    expect(clash.ok).toBe(false);

    expect(await encryptExistingData(prisma, testCipher)).toMatchObject({ locations: 1, auditEntries: 1 });
    const raw = await prisma.member.findUniqueOrThrow({ where: { id: legacy.id }, include: { location: true } });
    expect(raw.whatsappNumberEncrypted).toMatch(/^v1:/);
    expect(raw.whatsappNumberHash).toBe(testCipher.blindIndex("+94775550000"));
    expect(raw.location?.areaLabelEncrypted).toMatch(/^v1:/);
    expect(raw.location?.coordinatesEncrypted).toMatch(/^v1:/);
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain("+94775550000");
    expect(await getMember(legacy.id)).toMatchObject({ whatsappNumber: "+94775550000" });

    // Running it again changes nothing.
    expect(await encryptExistingData(prisma, testCipher)).toEqual({ members: 0, locations: 0, auditEntries: 0 });
  });
});

describe("September study-year rollover", () => {
  it("moves everyone up a level once per academic year and makes L6 finishers alumni", async () => {
    const foundation = await createMember({ firstName: "Foundation" });
    const l5 = await createMember({ firstName: "L5", status: "ACTIVE" });
    const finalYear = await createMember({ firstName: "Final", status: "ACTIVE" });
    const alumnus = await createMember({ firstName: "Alumnus", status: "ALUMNI" });
    await prisma.member.update({ where: { id: foundation.id }, data: { yearOfStudy: "FOUNDATION" } });
    await prisma.member.update({ where: { id: l5.id }, data: { yearOfStudy: "L5" } });
    await prisma.member.update({ where: { id: finalYear.id }, data: { yearOfStudy: "L6" } });
    await prisma.member.update({ where: { id: alumnus.id }, data: { yearOfStudy: "L6" } });

    // First run only records the year the typed-in levels describe.
    expect(await runStudyYearRollover("2026-10-04")).toMatchObject({ academicYear: 2026, rollovers: 0 });
    expect(await runStudyYearRollover("2027-08-31")).toMatchObject({ rollovers: 0 });

    expect(await runStudyYearRollover("2027-09-01")).toEqual({
      academicYear: 2027,
      rollovers: 1,
      promoted: 2,
      graduated: 1,
    });
    const levels = async () =>
      Object.fromEntries((await prisma.member.findMany()).map((m) => [m.firstName, `${m.yearOfStudy} ${m.status}`]));
    expect(await levels()).toEqual({
      Foundation: "L4 PROSPECTIVE",
      L5: "PLACEMENT ACTIVE",
      Final: "L6 ALUMNI",
      Alumnus: "L6 ALUMNI",
    });

    // Daily cron calls on the following days do nothing more.
    expect(await runStudyYearRollover("2027-09-02")).toMatchObject({ rollovers: 0 });
    expect(await prisma.auditLog.count({ where: { action: "member.study-year-rollover" } })).toBe(1);
  });
});
