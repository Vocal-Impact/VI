import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commitImport, previewImport } from "@/modules/imports";
import { prisma } from "@/shared/db/prisma";
import { toIsoDate } from "@/shared/lib/dates";
import { createUser } from "../support/factories";

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
    expect(members.map((m) => [m.firstName, m.status, m.source, m.voiceType, m.whatsappNumber])).toEqual([
      ["Amaya", "PROSPECTIVE", "CSV_IMPORT", "ALTO", "+94771111111"],
      ["Kavindu", "PROSPECTIVE", "CSV_IMPORT", "BASS", "+94772222222"],
      ["Hiruni", "PROSPECTIVE", "CSV_IMPORT", "UNASSIGNED", "+94774444444"],
    ]);
    expect(members[2]?.yearOfStudy).toBe(0);

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
    expect(withDetails[0]?.location).toMatchObject({
      areaLabel: "Dehiwala",
      canDrive: false,
      consentGiven: true,
      geocodeStatus: "PENDING",
    });
    expect(withDetails[1]?.location).toMatchObject({ areaLabel: "Moratuwa", canDrive: true, seats: 3 });
    expect(withDetails[2]?.location).toBeNull(); // no consent → nothing stored

    expect(await prisma.importBatch.count()).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: "import.commit" } })).toBe(3);
  });

  it("rejects a file for the wrong form", async () => {
    const admin = await createUser();
    const result = await commitImport("SUPPLEMENTARY_DETAILS", registration, "form.csv", admin.id);
    expect(result.ok).toBe(false);
  });
});
