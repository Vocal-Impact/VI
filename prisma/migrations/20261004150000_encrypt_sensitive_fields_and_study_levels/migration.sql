-- Sensitive fields move to encrypted columns, and year of study becomes an IIT level.
-- Existing values are kept as legacy plaintext (the app reads them transparently);
-- `npm run db:encrypt` (also run on every Vercel deploy) then encrypts them in place.

-- Year of study -> level. Old numbers: 0 = Foundation, 1 = L4, 2 = L5, 3 = Placement year, 4+ = L6.
CREATE TYPE "StudyLevel" AS ENUM ('FOUNDATION', 'L4', 'L5', 'PLACEMENT', 'L6');
ALTER TABLE "member" ALTER COLUMN "yearOfStudy" TYPE "StudyLevel" USING (
  CASE
    WHEN "yearOfStudy" <= 0 THEN 'FOUNDATION'
    WHEN "yearOfStudy" = 1 THEN 'L4'
    WHEN "yearOfStudy" = 2 THEN 'L5'
    WHEN "yearOfStudy" = 3 THEN 'PLACEMENT'
    ELSE 'L6'
  END
)::"StudyLevel";

-- WhatsApp number -> encrypted column + blind index (filled by db:encrypt).
ALTER TABLE "member" RENAME COLUMN "whatsappNumber" TO "whatsappNumberEncrypted";
ALTER TABLE "member" ADD COLUMN "whatsappNumberHash" TEXT;
ALTER TABLE "member" ADD COLUMN "dietaryPreferenceEncrypted" TEXT;
CREATE INDEX "member_whatsappNumberHash_idx" ON "member"("whatsappNumberHash");

-- Location: area label and coordinates encrypted; coordinates kept as "lat,lng" text.
ALTER TABLE "member_location" RENAME COLUMN "areaLabel" TO "areaLabelEncrypted";
ALTER TABLE "member_location" ADD COLUMN "coordinatesEncrypted" TEXT;
UPDATE "member_location"
  SET "coordinatesEncrypted" = "latitude"::text || ',' || "longitude"::text
  WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;
ALTER TABLE "member_location" DROP COLUMN "latitude", DROP COLUMN "longitude";

-- The geocode cache was keyed by the typed landmark; it is now keyed by a fingerprint.
-- It is only a cache, so start it afresh.
DELETE FROM "geocode_cache";
ALTER TABLE "geocode_cache" DROP COLUMN "displayName";
