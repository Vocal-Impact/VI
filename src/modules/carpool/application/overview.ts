import "server-only";
import { prisma } from "@/shared/db/prisma";
import { getEnv } from "@/shared/config/env";
import { getSettings } from "@/shared/settings/settings";
import { reveal, revealLocation } from "@/shared/crypto/sensitive";
import { errorMessage, logger } from "@/shared/lib/logger";
import type { LatLng } from "../domain/geo";
import type { RoadRoute, RouteProvider } from "../domain/ports";
import {
  estimatedDistanceTable,
  roadDistanceTable,
  suggestCarpools,
  VENUE_ID,
  type CarpoolPerson,
  type DistanceTable,
} from "../domain/suggestions";
import { MAX_MATRIX_POINTS, OrsRouteProvider } from "../infrastructure/ors-route-provider";

/**
 * Small in-memory caches so reloading the page doesn't spend the free
 * OpenRouteService quota. Keyed by the exact (rounded) coordinates.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_LIMIT = 200;
const matrixCache = new Map<string, { at: number; value: Array<Array<number | null>> }>();
const routeCache = new Map<string, { at: number; value: RoadRoute }>();

const pointsKey = (points: readonly LatLng[]) => points.map((p) => `${p.latitude},${p.longitude}`).join(";");

function remember<T>(cache: Map<string, { at: number; value: T }>, key: string, value: T): void {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, { at: Date.now(), value });
}

function recall<T>(cache: Map<string, { at: number; value: T }>, key: string): T | undefined {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.value : undefined;
}

export type RoutingStatus =
  | "road" // real road distances and routes
  | "not-configured" // no ORS_API_KEY: straight-line estimate × road factor
  | "too-many" // more people than one free matrix request allows
  | "unavailable"; // the routing service failed — estimates for now

async function buildDistanceTable(
  provider: RouteProvider | null,
  people: CarpoolPerson[],
  venue: LatLng,
): Promise<{ table: DistanceTable; status: RoutingStatus }> {
  const estimate = estimatedDistanceTable(people, venue);
  if (!provider) return { table: estimate, status: "not-configured" };
  if (people.length + 1 > MAX_MATRIX_POINTS) return { table: estimate, status: "too-many" };

  const ids = [VENUE_ID, ...people.map((person) => person.id)];
  const points = [venue, ...people];
  const key = pointsKey(points);
  try {
    const matrix = recall(matrixCache, key) ?? (await provider.distanceMatrix(points));
    if (!matrix) return { table: estimate, status: "unavailable" };
    remember(matrixCache, key, matrix);
    return { table: roadDistanceTable(ids, matrix, estimate), status: "road" };
  } catch (error) {
    logger.warn("Road distance lookup failed", { error: errorMessage(error) });
    return { table: estimate, status: "unavailable" };
  }
}

async function roadRoute(provider: RouteProvider, points: LatLng[]): Promise<RoadRoute | null> {
  const key = pointsKey(points);
  const cached = recall(routeCache, key);
  if (cached) return cached;
  try {
    const route = await provider.route(points);
    if (route) remember(routeCache, key, route);
    return route;
  } catch (error) {
    logger.warn("Route lookup failed", { error: errorMessage(error) });
    return null;
  }
}

/**
 * Map data and lift-home suggestions. With `attendeeIds` (people going to /
 * present at a practice) only they are considered; otherwise every member
 * with a location.
 */
export async function getCarpoolOverview(
  options: { routeProvider?: RouteProvider | null; attendeeIds?: ReadonlySet<string> } = {},
) {
  const settings = await getSettings();
  const venue = settings.practiceVenue;
  const attending = (memberId: string) => !options.attendeeIds || options.attendeeIds.has(memberId);
  const stored = await prisma.memberLocation.findMany({
    where: { consentGiven: true, member: { deletedAt: null, status: { in: ["PROSPECTIVE", "ACTIVE"] } } },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, voiceType: true, whatsappNumberEncrypted: true } },
    },
  });
  // Areas are encrypted, so sort after decrypting.
  const locations = stored
    .map((location) => {
      const { member, ...rest } = revealLocation(location);
      const { whatsappNumberEncrypted, ...person } = member;
      return { ...rest, member: { ...person, whatsappNumber: reveal(whatsappNumberEncrypted) } };
    })
    .sort((a, b) => a.areaLabel.localeCompare(b.areaLabel));

  const located: CarpoolPerson[] = locations
    .filter((location) => attending(location.member.id))
    .filter((location) => location.latitude !== null && location.longitude !== null)
    .map((location) => ({
      id: location.member.id,
      name: `${location.member.firstName} ${location.member.lastName}`,
      areaLabel: location.areaLabel,
      latitude: location.latitude as number,
      longitude: location.longitude as number,
      canDrive: location.canDrive,
      seats: location.seats,
    }));

  const apiKey = getEnv().ORS_API_KEY;
  const provider =
    options.routeProvider === undefined ? (apiKey ? new OrsRouteProvider(apiKey) : null) : options.routeProvider;

  const { table, status } = await buildDistanceTable(provider, located, venue);
  const suggestions = suggestCarpools(
    located,
    venue,
    { clusterRadiusKm: settings.carpoolClusterRadiusKm, maxDetourKm: settings.carpoolMaxDetourKm },
    table,
  );

  // Real road routes for the suggested lifts (venue → drop-offs → driver's home), for the map.
  const routes: Record<string, RoadRoute> = {};
  if (provider && status === "road") {
    await Promise.all(
      suggestions.driverGroups.map(async (group) => {
        const route = await roadRoute(provider, [venue, ...group.passengers, group.driver]);
        if (route) routes[group.driver.id] = route;
      }),
    );
  }

  return {
    venue,
    people: located,
    routingStatus: status,
    routes,
    whatsappById: Object.fromEntries(locations.map((location) => [location.member.id, location.member.whatsappNumber])),
    pending: locations.filter((location) => location.geocodeStatus === "PENDING").length,
    /** Attendees we can't place: no location shared at all. */
    attendeesWithoutLocation: options.attendeeIds
      ? [...options.attendeeIds].filter((id) => !locations.some((location) => location.member.id === id)).length
      : 0,
    unlocated: locations
      .filter((location) => attending(location.member.id))
      .filter((location) => location.geocodeStatus === "NOT_FOUND" || location.geocodeStatus === "FAILED")
      .map((location) => ({
        memberId: location.member.id,
        name: `${location.member.firstName} ${location.member.lastName}`,
        areaLabel: location.areaLabel,
        status: location.geocodeStatus,
      })),
    suggestions,
    settings: { clusterRadiusKm: settings.carpoolClusterRadiusKm, maxDetourKm: settings.carpoolMaxDetourKm },
  };
}
