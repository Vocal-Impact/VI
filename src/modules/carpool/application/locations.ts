import "server-only";
import { z } from "zod";
import { prisma, type DbClient } from "@/shared/db/prisma";
import { getEnv } from "@/shared/config/env";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { errorMessage, logger } from "@/shared/lib/logger";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import { memberLocationInputSchema } from "../schemas";
import { roundLatLng } from "../domain/geo";
import type { Geocoder } from "../domain/ports";
import { NominatimGeocoder } from "../infrastructure/nominatim-geocoder";
import { PhotonGeocoder } from "../infrastructure/photon-geocoder";
import { ChainGeocoder } from "../infrastructure/chain-geocoder";
import { geocodeCacheKey } from "../domain/geocoding";
import { parseCoordinates } from "@/shared/lib/coordinates";
import { getSettings } from "@/shared/settings/settings";

export interface LocationDetails {
  areaLabel: string;
  canDrive: boolean;
  seats: number;
}

const pinSchema = z
  .object({ latitude: z.number().min(5.5).max(10), longitude: z.number().min(79.4).max(82) })
  .nullable()
  .optional();

/**
 * Saves (or, with `null`, removes) a member's carpool details from the
 * supplementary-details import. Changing the area re-queues geocoding.
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
  const current = await db.memberLocation.findUnique({ where: { memberId } });
  const areaChanged = !current || current.areaLabel.toLowerCase() !== details.areaLabel.toLowerCase();
  await db.memberLocation.upsert({
    where: { memberId },
    create: { memberId, ...details, consentGiven: true, geocodeStatus: "PENDING" },
    update: {
      ...details,
      consentGiven: true,
      ...(areaChanged ? { latitude: null, longitude: null, geocodeStatus: "PENDING" as const } : {}),
    },
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
    await saveLocationFromImport(memberId, { areaLabel, canDrive, seats: canDrive ? seats : 0 }, tx);
    if (pin.data) {
      const rounded = roundLatLng(pin.data);
      await tx.memberLocation.update({ where: { memberId }, data: { ...rounded, geocodeStatus: "OK" } });
    }
    await writeAuditLog(
      {
        actorId,
        action: "location.update",
        entity: "member",
        entityId: memberId,
        diff: { areaLabel, canDrive, seats },
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
  // Nominatim first (precise for named areas), then Photon (forgiving, better with landmarks).
  return new ChainGeocoder([
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

/**
 * Locates queued areas. Coordinates typed instead of an area are used as-is;
 * otherwise cached answers are reused and new ones looked up (only successful
 * lookups are cached, so a retry really searches again).
 */
export async function geocodePendingLocations(
  options: { geocoder?: Geocoder | null; limit?: number; timeBudgetMs?: number } = {},
): Promise<GeocodeRunSummary> {
  const geocoder = options.geocoder === undefined ? await createGeocoder() : options.geocoder;
  const limit = options.limit ?? 8;
  const deadline = Date.now() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const summary: GeocodeRunSummary = { processed: 0, located: 0, notFound: 0, failed: 0, remaining: 0 };

  const pending = await prisma.memberLocation.findMany({ where: { geocodeStatus: "PENDING" }, take: limit });

  const markLocated = async (memberId: string, point: { latitude: number; longitude: number }) => {
    await prisma.memberLocation.update({ where: { memberId }, data: { ...roundLatLng(point), geocodeStatus: "OK" } });
    summary.located += 1;
  };

  for (const location of pending) {
    if (Date.now() > deadline) break;
    const typedCoordinates = parseCoordinates(location.areaLabel);
    if (typedCoordinates) {
      summary.processed += 1;
      await markLocated(location.memberId, typedCoordinates);
      continue;
    }

    const query = geocodeCacheKey(location.areaLabel);
    try {
      const cached = await prisma.geocodeCache.findUnique({ where: { query } });
      let hit = cached?.latitude != null && cached.longitude != null ? cached : null;
      if (!hit) {
        if (!geocoder) break;
        const result = await geocoder.geocode(location.areaLabel);
        if (result) {
          hit = await prisma.geocodeCache.upsert({
            where: { query },
            create: { query, latitude: result.latitude, longitude: result.longitude, displayName: result.displayName },
            update: { latitude: result.latitude, longitude: result.longitude, displayName: result.displayName },
          });
        }
      }
      summary.processed += 1;
      if (hit?.latitude != null && hit.longitude != null) {
        await markLocated(location.memberId, { latitude: hit.latitude, longitude: hit.longitude });
      } else {
        await prisma.memberLocation.update({
          where: { memberId: location.memberId },
          data: { geocodeStatus: "NOT_FOUND" },
        });
        summary.notFound += 1;
      }
    } catch (error) {
      logger.warn("Geocoding failed", { area: location.areaLabel, error: errorMessage(error) });
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
