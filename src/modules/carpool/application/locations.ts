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

function createGeocoder(): Geocoder | null {
  const env = getEnv();
  return env.GEOCODER === "nominatim" ? new NominatimGeocoder(env.NOMINATIM_USER_AGENT) : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const NOMINATIM_INTERVAL_MS = 1100;

export interface GeocodeRunSummary {
  processed: number;
  located: number;
  notFound: number;
  failed: number;
  remaining: number;
}

/**
 * Geocodes queued areas, reusing cached answers and pausing between live
 * requests to respect Nominatim's 1 request/second policy.
 */
export async function geocodePendingLocations(
  options: { geocoder?: Geocoder | null; limit?: number; intervalMs?: number } = {},
): Promise<GeocodeRunSummary> {
  const geocoder = options.geocoder === undefined ? createGeocoder() : options.geocoder;
  const limit = options.limit ?? 8;
  const intervalMs = options.intervalMs ?? NOMINATIM_INTERVAL_MS;
  const summary: GeocodeRunSummary = { processed: 0, located: 0, notFound: 0, failed: 0, remaining: 0 };

  const pending = await prisma.memberLocation.findMany({ where: { geocodeStatus: "PENDING" }, take: limit });
  let liveCalls = 0;

  for (const location of pending) {
    const query = `${location.areaLabel}, Sri Lanka`.toLowerCase();
    try {
      let cached = await prisma.geocodeCache.findUnique({ where: { query } });
      if (!cached) {
        if (!geocoder) break;
        if (liveCalls > 0) await sleep(intervalMs);
        liveCalls += 1;
        const result = await geocoder.geocode(query);
        cached = await prisma.geocodeCache.create({
          data: {
            query,
            latitude: result?.latitude ?? null,
            longitude: result?.longitude ?? null,
            displayName: result?.displayName ?? null,
          },
        });
      }
      summary.processed += 1;
      if (cached.latitude !== null && cached.longitude !== null) {
        const rounded = roundLatLng({ latitude: cached.latitude, longitude: cached.longitude });
        await prisma.memberLocation.update({
          where: { memberId: location.memberId },
          data: { ...rounded, geocodeStatus: "OK" },
        });
        summary.located += 1;
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

/** Puts failed / not-found areas back in the queue (e.g. after fixing a typo upstream). */
export async function requeueFailedGeocodes(): Promise<number> {
  const result = await prisma.memberLocation.updateMany({
    where: { geocodeStatus: { in: ["FAILED", "NOT_FOUND"] } },
    data: { geocodeStatus: "PENDING" },
  });
  return result.count;
}
