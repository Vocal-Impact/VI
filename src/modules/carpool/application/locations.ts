import "server-only";
import { z } from "zod";
import { prisma, type DbClient } from "@/shared/db/prisma";
import { getEnv } from "@/shared/config/env";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { fingerprint, reveal, seal, sealCoordinates } from "@/shared/crypto/sensitive";
import { errorMessage, logger } from "@/shared/lib/logger";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import { parseCoordinates, type Coordinates } from "@/shared/lib/coordinates";
import { getSettings } from "@/shared/settings/settings";
import { memberLocationInputSchema } from "../schemas";
import { roundLatLng } from "../domain/geo";
import type { Geocoder } from "../domain/ports";
import { geocodeCacheKey } from "../domain/geocoding";
import { NominatimGeocoder } from "../infrastructure/nominatim-geocoder";
import { PhotonGeocoder } from "../infrastructure/photon-geocoder";
import { GoogleGeocoder } from "../infrastructure/google-geocoder";
import { ChainGeocoder } from "../infrastructure/chain-geocoder";

export interface LocationDetails {
  /** Where they live as typed: nearest landmark, area, or pasted coordinates. */
  areaLabel: string;
  canDrive: boolean;
  seats: number;
  /** Known coordinates (pin, pasted, or from the geocoding script's CSV column). Skips geocoding. */
  coordinates?: Coordinates | null;
}

const pinSchema = z
  .object({ latitude: z.number().min(5.5).max(10), longitude: z.number().min(79.4).max(82) })
  .nullable()
  .optional();

/**
 * Saves (or, with `null`, removes) a member's location from a CSV import or
 * a form. The area is stored encrypted next to its coordinates; a changed
 * area without coordinates is queued for geocoding (see `geocodeLocations`).
 */
export async function saveLocationFromImport(
  memberId: string,
  details: LocationDetails | null,
  db: DbClient,
): Promise<void> {
  if (details === null) {
    await db.memberLocation.deleteMany({ where: { memberId } });
    return;
  }
  const { areaLabel, canDrive, seats } = details;
  const current = await db.memberLocation.findUnique({ where: { memberId } });
  const areaChanged = !current || reveal(current.areaLabelEncrypted).toLowerCase() !== areaLabel.toLowerCase();
  const point = details.coordinates ? roundLatLng(details.coordinates) : null;
  const position = point
    ? { coordinatesEncrypted: sealCoordinates(point), geocodeStatus: "OK" as const }
    : areaChanged
      ? { coordinatesEncrypted: null, geocodeStatus: "PENDING" as const }
      : {};
  await db.memberLocation.upsert({
    where: { memberId },
    create: {
      memberId,
      areaLabelEncrypted: seal(areaLabel),
      canDrive,
      seats,
      consentGiven: true,
      coordinatesEncrypted: null,
      geocodeStatus: "PENDING",
      ...position,
    },
    update: { areaLabelEncrypted: seal(areaLabel), canDrive, seats, consentGiven: true, ...position },
  });
}

/** Saves carpool details from the member profile. An optional map pin skips geocoding. */
export async function saveMemberLocation(memberId: string, raw: unknown, actorId: string): Promise<Result<null>> {
  const parsed = memberLocationInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const pin = pinSchema.safeParse((raw as { pin?: unknown }).pin);
  if (!pin.success) return err("VALIDATION", "The map pin must be in Sri Lanka", { pin: ["Pin must be in Sri Lanka"] });

  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
  if (!member) return err("NOT_FOUND", "Member not found");

  const { areaLabel, canDrive, seats } = parsed.data;
  await prisma.$transaction(async (tx) => {
    await saveLocationFromImport(
      memberId,
      { areaLabel, canDrive, seats: canDrive ? seats : 0, coordinates: pin.data ?? null },
      tx,
    );
    await writeAuditLog(
      {
        actorId,
        action: "location.update",
        entity: "member",
        entityId: memberId,
        // The area itself is encrypted; never copy it into the audit log.
        diff: { areaLabel: "[encrypted]", pinned: !!pin.data, canDrive, seats },
      },
      tx,
    );
  });
  return ok(null);
}

export async function removeMemberLocation(memberId: string, actorId: string): Promise<Result<null>> {
  await prisma.$transaction(async (tx) => {
    await tx.memberLocation.deleteMany({ where: { memberId } });
    await writeAuditLog({ actorId, action: "location.remove", entity: "member", entityId: memberId }, tx);
  });
  return ok(null);
}

async function createGeocoder(): Promise<Geocoder | null> {
  const env = getEnv();
  if (env.GEOCODER !== "nominatim") return null;
  const venue = (await getSettings()).practiceVenue;
  // Google first when configured (best with local landmarks), then Nominatim
  // (precise for named areas), then Photon (forgiving with typos).
  return new ChainGeocoder([
    ...(env.GOOGLE_MAPS_API_KEY ? [new GoogleGeocoder(env.GOOGLE_MAPS_API_KEY)] : []),
    new NominatimGeocoder(env.NOMINATIM_USER_AGENT),
    new PhotonGeocoder(env.NOMINATIM_USER_AGENT, venue),
  ]);
}

/** Stop starting new lookups after this long, so a run fits in a 60 s serverless request. */
const DEFAULT_TIME_BUDGET_MS = 40_000;

export interface GeocodeRunSummary {
  processed: number;
  located: number;
  notFound: number;
  failed: number;
  remaining: number;
}

/** The geocode cache is keyed by a fingerprint, so it never reveals the landmarks people typed. */
function cacheKeyFor(area: string): string {
  return fingerprint(geocodeCacheKey(area));
}

/**
 * Finds coordinates for queued locations — all of them, or just `memberIds`
 * (run right after a form or import saves them). Coordinates typed instead of
 * an area are used as-is; otherwise cached answers are reused and new ones
 * looked up (only successful lookups are cached, so a retry really searches again).
 */
export async function geocodeLocations(
  options: { geocoder?: Geocoder | null; limit?: number; timeBudgetMs?: number; memberIds?: readonly string[] } = {},
): Promise<GeocodeRunSummary> {
  const geocoder = options.geocoder === undefined ? await createGeocoder() : options.geocoder;
  const limit = options.limit ?? 8;
  const deadline = Date.now() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const summary: GeocodeRunSummary = { processed: 0, located: 0, notFound: 0, failed: 0, remaining: 0 };

  const pending = await prisma.memberLocation.findMany({
    where: { geocodeStatus: "PENDING", ...(options.memberIds ? { memberId: { in: [...options.memberIds] } } : {}) },
    take: limit,
  });

  const markLocated = async (memberId: string, point: Coordinates) => {
    await prisma.memberLocation.update({
      where: { memberId },
      data: { coordinatesEncrypted: sealCoordinates(roundLatLng(point)), geocodeStatus: "OK" },
    });
    summary.located += 1;
  };

  for (const location of pending) {
    if (Date.now() > deadline) break;
    const areaLabel = reveal(location.areaLabelEncrypted);
    const typedCoordinates = parseCoordinates(areaLabel);
    if (typedCoordinates) {
      summary.processed += 1;
      await markLocated(location.memberId, typedCoordinates);
      continue;
    }

    const query = cacheKeyFor(areaLabel);
    try {
      const cached = await prisma.geocodeCache.findUnique({ where: { query } });
      let hit: Coordinates | null =
        cached?.latitude != null && cached.longitude != null
          ? { latitude: cached.latitude, longitude: cached.longitude }
          : null;
      if (!hit) {
        if (!geocoder) break;
        const result = await geocoder.geocode(areaLabel);
        if (result) {
          hit = roundLatLng(result);
          await prisma.geocodeCache.upsert({
            where: { query },
            create: { query, ...hit },
            update: hit,
          });
        }
      }
      summary.processed += 1;
      if (hit) {
        await markLocated(location.memberId, hit);
      } else {
        await prisma.memberLocation.update({
          where: { memberId: location.memberId },
          data: { geocodeStatus: "NOT_FOUND" },
        });
        summary.notFound += 1;
      }
    } catch (error) {
      logger.warn("Geocoding failed", { memberId: location.memberId, error: errorMessage(error) });
      await prisma.memberLocation.update({ where: { memberId: location.memberId }, data: { geocodeStatus: "FAILED" } });
      summary.failed += 1;
    }
  }

  summary.remaining = await prisma.memberLocation.count({ where: { geocodeStatus: "PENDING" } });
  return summary;
}

/** Puts failed / not-found areas back in the queue and forgets old "not found" answers so they're searched again. */
export async function requeueFailedGeocodes(): Promise<number> {
  await prisma.geocodeCache.deleteMany({ where: { OR: [{ latitude: null }, { longitude: null }] } });
  const result = await prisma.memberLocation.updateMany({
    where: { geocodeStatus: { in: ["FAILED", "NOT_FOUND"] } },
    data: { geocodeStatus: "PENDING" },
  });
  return result.count;
}
