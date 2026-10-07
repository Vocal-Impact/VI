import "server-only";
import { prisma } from "@/shared/db/prisma";
import { getEnv } from "@/shared/config/env";
import { todayLocal } from "@/shared/lib/clock";
import { toIsoDate } from "@/shared/lib/dates";
import { err, ok, type Result } from "@/shared/lib/result";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { reveal, revealLocation } from "@/shared/crypto/sensitive";
import { listMembersForImport, setDateOfBirth, upsertMemberFromImport } from "@/modules/members";
import { saveLocationFromImport } from "@/modules/carpool";
import { MAX_CSV_BYTES, parseCsv, type ParsedCsv } from "../domain/csv";
import type { ImportPreview } from "../domain/preview";
import { buildRegistrationPreview, type RegistrationData } from "../domain/profiles/registration";
import { buildSupplementaryPreview, type SupplementaryData } from "../domain/profiles/supplementary-details";

export const IMPORT_PROFILES = ["REGISTRATION", "SUPPLEMENTARY_DETAILS"] as const;
export type ImportProfileName = (typeof IMPORT_PROFILES)[number];

export type AnyPreview =
  | { profile: "REGISTRATION"; preview: ImportPreview<RegistrationData> }
  | { profile: "SUPPLEMENTARY_DETAILS"; preview: ImportPreview<SupplementaryData> };

function readCsv(text: string): Result<ParsedCsv> {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) return err("VALIDATION", "File is larger than 1 MB");
  const csv = parseCsv(text);
  if (csv.headers.length === 0) return err("VALIDATION", "The file is empty or is not a CSV");
  if (csv.rows.length === 0) return err("VALIDATION", "The file has a header row but no data");
  return ok(csv);
}

export interface ImportOptions {
  /** Registration only: take new members' status from the Status column (first load of existing members). */
  useStatusColumn?: boolean;
}

async function registrationPreview(csv: ParsedCsv, options: ImportOptions) {
  // A choir has a few hundred members at most, so compare against all of them
  // (including removed ones, whose student IDs and emails are still taken).
  const [existing, locations] = await Promise.all([listMembersForImport(), prisma.memberLocation.findMany()]);
  const locationByMember = new Map(
    locations.map((stored) => {
      const location = revealLocation(stored);
      const coordinates =
        location.latitude != null && location.longitude != null
          ? { latitude: location.latitude, longitude: location.longitude }
          : null;
      return [
        location.memberId,
        { areaLabel: location.areaLabel, coordinates, canDrive: location.canDrive, seats: location.seats },
      ];
    }),
  );
  return buildRegistrationPreview(
    csv,
    existing.map((member) => ({
      ...member,
      dateOfBirth: member.dateOfBirth ? toIsoDate(member.dateOfBirth) : null,
      location: locationByMember.get(member.id) ?? null,
    })),
    {
      allowedDomain: getEnv().ALLOWED_EMAIL_DOMAIN,
      today: todayLocal(),
      useStatusColumn: options.useStatusColumn ?? false,
    },
  );
}

async function supplementaryPreview(csv: ParsedCsv) {
  const existing = await prisma.member.findMany({ where: { deletedAt: null }, include: { location: true } });
  return buildSupplementaryPreview(
    csv,
    existing.map((member) => ({
      id: member.id,
      studentId: member.studentId,
      name: `${member.firstName} ${member.lastName}`,
      dateOfBirth: member.dateOfBirth ? toIsoDate(member.dateOfBirth) : null,
      location: member.location
        ? {
            areaLabel: reveal(member.location.areaLabelEncrypted),
            canDrive: member.location.canDrive,
            seats: member.location.seats,
          }
        : null,
    })),
    { today: todayLocal() },
  );
}

/** Dry run: parses and validates the CSV and reports what would change. Writes nothing. */
export async function previewImport(
  profile: ImportProfileName,
  text: string,
  options: ImportOptions = {},
): Promise<Result<AnyPreview>> {
  const csv = readCsv(text);
  if (!csv.ok) return csv;
  if (profile === "REGISTRATION") return ok({ profile, preview: await registrationPreview(csv.value, options) });
  return ok({ profile, preview: await supplementaryPreview(csv.value) });
}

export interface ImportSummary {
  batchId: string;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  /** Members whose location still needs coordinates — geocode them right after the import. */
  locationsToGeocode: string[];
}

/**
 * Applies an import. The preview is recomputed from the same file on the
 * server (never trusted from the browser) and applied in one transaction.
 */
export async function commitImport(
  profile: ImportProfileName,
  text: string,
  fileName: string,
  actorId: string,
  options: ImportOptions = {},
): Promise<Result<ImportSummary>> {
  const result = await previewImport(profile, text, options);
  if (!result.ok) return result;
  const { preview } = result.value;
  if (preview.missingColumns.length > 0)
    return err("VALIDATION", `Missing columns: ${preview.missingColumns.join(", ")}`);

  const skippedIssues = [...preview.invalid, ...preview.duplicates];

  const locationsToGeocode: string[] = [];
  const batch = await prisma.$transaction(
    async (tx) => {
      if (result.value.profile === "REGISTRATION") {
        for (const item of [...result.value.preview.created, ...result.value.preview.updated]) {
          const { location, ...member } = item.data;
          const { id } = await upsertMemberFromImport(member, tx);
          if (location) {
            await saveLocationFromImport(id, location, tx);
            if (!location.coordinates) locationsToGeocode.push(id);
          }
        }
      } else {
        for (const item of result.value.preview.updated) {
          const memberId = item.memberId as string;
          if (item.data.dateOfBirth) await setDateOfBirth(memberId, item.data.dateOfBirth, tx);
          if (item.data.location !== undefined) {
            await saveLocationFromImport(memberId, item.data.location, tx);
            if (item.data.location) locationsToGeocode.push(memberId);
          }
        }
      }

      const created = await tx.importBatch.create({
        data: {
          profile,
          fileName: fileName.slice(0, 200),
          uploadedById: actorId,
          createdCount: preview.created.length,
          updatedCount: preview.updated.length,
          unchangedCount: preview.unchanged.length,
          skippedCount: skippedIssues.length,
          errors: skippedIssues.map((issue) => ({ ...issue })),
        },
      });
      await writeAuditLog(
        {
          actorId,
          action: "import.commit",
          entity: "import_batch",
          entityId: created.id,
          diff: { profile, created: preview.created.length, updated: preview.updated.length },
        },
        tx,
      );
      return created;
    },
    { timeout: 60_000 },
  );

  return ok({
    batchId: batch.id,
    created: preview.created.length,
    updated: preview.updated.length,
    unchanged: preview.unchanged.length,
    skipped: skippedIssues.length,
    locationsToGeocode,
  });
}

export async function listImportBatches(take = 10) {
  return prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { uploadedBy: { select: { name: true } } },
  });
}
