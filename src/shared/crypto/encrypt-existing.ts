import type { PrismaClient } from "../../generated/prisma/client";
import { isEncrypted, type FieldCipher } from "./field-encryption";

export interface EncryptExistingSummary {
  members: number;
  locations: number;
  auditEntries: number;
}

const REDACTED = "[encrypted]";
/** Keys in old audit-log diffs that held values which are now encrypted. */
const SENSITIVE_AUDIT_KEYS = ["whatsappNumber", "areaLabel", "dietaryPreference"] as const;

/**
 * Encrypts values saved before field encryption existed (plaintext left in
 * the `…Encrypted` columns by the migration), fills in missing phone
 * fingerprints and scrubs phone numbers / areas from old audit-log entries.
 * Idempotent: rows that are already encrypted are skipped. Uses relative
 * imports and no `server-only`, so `npm run db:encrypt` can run it with tsx.
 */
export async function encryptExistingData(db: PrismaClient, cipher: FieldCipher): Promise<EncryptExistingSummary> {
  const summary: EncryptExistingSummary = { members: 0, locations: 0, auditEntries: 0 };

  const members = await db.member.findMany({
    select: { id: true, whatsappNumberEncrypted: true, whatsappNumberHash: true, dietaryPreferenceEncrypted: true },
  });
  for (const member of members) {
    const phone = cipher.decrypt(member.whatsappNumberEncrypted);
    const hash = cipher.blindIndex(phone);
    const diet = member.dietaryPreferenceEncrypted;
    const needsWork =
      !isEncrypted(member.whatsappNumberEncrypted) ||
      member.whatsappNumberHash !== hash ||
      (diet && !isEncrypted(diet));
    if (!needsWork) continue;
    await db.member.update({
      where: { id: member.id },
      data: {
        whatsappNumberEncrypted: isEncrypted(member.whatsappNumberEncrypted)
          ? member.whatsappNumberEncrypted
          : cipher.encrypt(phone),
        whatsappNumberHash: hash,
        dietaryPreferenceEncrypted: diet && !isEncrypted(diet) ? cipher.encrypt(diet) : diet,
      },
    });
    summary.members += 1;
  }

  const locations = await db.memberLocation.findMany({
    select: { memberId: true, areaLabelEncrypted: true, coordinatesEncrypted: true },
  });
  for (const location of locations) {
    const area = location.areaLabelEncrypted;
    const coordinates = location.coordinatesEncrypted;
    if (isEncrypted(area) && (!coordinates || isEncrypted(coordinates))) continue;
    await db.memberLocation.update({
      where: { memberId: location.memberId },
      data: {
        areaLabelEncrypted: isEncrypted(area) ? area : cipher.encrypt(area),
        coordinatesEncrypted: coordinates && !isEncrypted(coordinates) ? cipher.encrypt(coordinates) : coordinates,
      },
    });
    summary.locations += 1;
  }

  for (const key of SENSITIVE_AUDIT_KEYS) {
    summary.auditEntries += await db.$executeRaw`
      UPDATE "audit_log"
      SET "diff" = jsonb_set("diff"::jsonb, ARRAY[${key}]::text[], to_jsonb(${REDACTED}::text))
      WHERE jsonb_typeof("diff"::jsonb) = 'object'
        AND "diff"::jsonb ? ${key}
        AND jsonb_typeof("diff"::jsonb -> ${key}) = 'string'
        AND "diff"::jsonb ->> ${key} <> ${REDACTED}`;
  }
  return summary;
}
