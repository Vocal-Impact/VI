import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commitImport, previewImport } from "@/modules/imports";
import { prisma } from "@/shared/db/prisma";
import { toIsoDate } from "@/shared/lib/dates";
import { createUser } from "../support/factories";
import { testCipher } from "../support/sealing";

const registration = readFileSync("tests/fixtures/registration-form.csv", "utf8");
const details = readFileSync("tests/fixtures/details-form.csv", "utf8");

describe("CSV import (registration → details)", () => {
  it("previews without writing anything", async () => {
    const result = await previewImport("REGISTRATION", registration);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.profile !== "REGISTRATION") return;
    const { preview } = result.value;
    expect(preview.created.map((item) => item.studentId)).toEqual(["W2026001", "W2026002", "W2026004"]);
    expect(preview.invalid).toHaveLength(1);
    expect(preview.duplicates).toHaveLength(1);
    expect(await prisma.member.count()).toBe(0);
  });

  it("commits members as prospective, is idempotent on re-import, then applies the details form", async () => {
    const admin = await createUser();

    const first = await commitImport("REGISTRATION", registration, "form.csv", admin.id);
    expect(first.ok && first.value).toMatchObject({ created: 3, updated: 0, skipped: 2 });

    const members = await prisma.member.findMany({ orderBy: { studentId: "asc" } });
    expect(
      members.map((m) => [m.firstName, m.status, m.source, m.voiceType, testCipher.decrypt(m.whatsappNumberEncrypted)]),
    ).toEqual([
      ["Amaya", "PROSPECTIVE", "CSV_IMPORT", "ALTO", "+94771111111"],
      ["Kavindu", "PROSPECTIVE", "CSV_IMPORT", "BASS", "+94772222222"],
      ["Hiruni", "PROSPECTIVE", "CSV_IMPORT", "UNASSIGNED", "+94774444444"],
    ]);
    expect(members.map((m) => m.yearOfStudy)).toEqual(["L4", "L4", "FOUNDATION"]);
    // Encrypted at rest, with a fingerprint for duplicate checks.
    expect(members[0]?.whatsappNumberEncrypted).toMatch(/^v1:/);
    expect(members[0]?.whatsappNumberHash).toBe(testCipher.blindIndex("+94771111111"));

    const again = await commitImport("REGISTRATION", registration, "form.csv", admin.id);
    expect(again.ok && again.value).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
    expect(await prisma.member.count()).toBe(3);

    const detailsResult = await commitImport("SUPPLEMENTARY_DETAILS", details, "details.csv", admin.id);
    expect(detailsResult.ok && detailsResult.value).toMatchObject({ updated: 3, skipped: 1 });

    const withDetails = await prisma.member.findMany({ include: { location: true }, orderBy: { studentId: "asc" } });
    expect(withDetails.map((m) => (m.dateOfBirth ? toIsoDate(m.dateOfBirth) : null))).toEqual([
      "2005-03-15",
      "2004-10-02",
      "2004-02-29",
    ]);
    expect(testCipher.decrypt(withDetails[0]!.location!.areaLabelEncrypted)).toBe("Dehiwala");
    expect(withDetails[0]?.location).toMatchObject({
      canDrive: false,
      consentGiven: true,
      geocodeStatus: "PENDING",
    });
    expect(testCipher.decrypt(withDetails[1]!.location!.areaLabelEncrypted)).toBe("Moratuwa");
    expect(withDetails[1]?.location).toMatchObject({ canDrive: true, seats: 3 });
    expect(withDetails[2]?.location).toBeNull(); // no consent → nothing stored

    expect(await prisma.importBatch.count()).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: "import.commit" } })).toBe(3);
  });

  it("imports the 2026 Google Form: status, encrypted landmark and dietary preference, coordinates column", async () => {
    const admin = await createUser();
    const form = readFileSync("tests/fixtures/registration-form-2026.csv", "utf8");
    const result = await commitImport("REGISTRATION", form, "new-form.csv", admin.id);
    expect(result.ok && result.value).toMatchObject({ created: 3, skipped: 0 });
    if (!result.ok) return;

    const members = await prisma.member.findMany({ include: { location: true }, orderBy: { studentId: "asc" } });
    expect(members.map((m) => [m.firstName, m.status, m.yearOfStudy])).toEqual([
      ["Nimal", "ACTIVE", "PLACEMENT"],
      ["Sara", "PROSPECTIVE", "L4"],
      ["Tharu", "PROSPECTIVE", "L6"],
    ]);
    expect(members[0]?.addedToWhatsappAt).not.toBeNull();
    expect(testCipher.decrypt(members[0]!.dietaryPreferenceEncrypted!)).toBe("No beef, no pork");
    expect(members[1]?.dietaryPreferenceEncrypted).toBeNull();

    // Landmark only → stored encrypted and queued for geocoding straight after the import.
    const nimal = members[0]!.location!;
    expect(nimal.areaLabelEncrypted).not.toContain("Kohuwala");
    expect(testCipher.decrypt(nimal.areaLabelEncrypted)).toBe("Kohuwala junction");
    expect(nimal).toMatchObject({ geocodeStatus: "PENDING", coordinatesEncrypted: null, consentGiven: true });
    // Coordinates column (from the geocoding script) → located immediately.
    const tharu = members[2]!.location!;
    expect(tharu.geocodeStatus).toBe("OK");
    expect(testCipher.decrypt(tharu.coordinatesEncrypted!)).toBe("6.866,79.877");
    expect(members[1]?.location).toBeNull();
    expect(result.value.locationsToGeocode).toEqual([members[0]!.id]);

    // Nothing sensitive leaks into the audit log or the import record.
    const logs = JSON.stringify(await prisma.auditLog.findMany()) + JSON.stringify(await prisma.importBatch.findMany());
    expect(logs).not.toMatch(/Kohuwala|no pork|775555555/);
  });

  it("rejects a file for the wrong form", async () => {
    const admin = await createUser();
    const result = await commitImport("SUPPLEMENTARY_DETAILS", registration, "form.csv", admin.id);
    expect(result.ok).toBe(false);
  });
});
