import "server-only";
import { prisma } from "@/shared/db/prisma";
import { getEnv } from "@/shared/config/env";
import { getSettings } from "@/shared/settings/settings";
import { errorMessage, logger } from "@/shared/lib/logger";
import type { LatLng } from "../domain/geo";
import type { RouteProvider } from "../domain/ports";
import { suggestCarpools, type CarpoolPerson } from "../domain/suggestions";
import { OrsRouteProvider } from "../infrastructure/ors-route-provider";

const routeCache = new Map<string, LatLng[] | null>();
const ROUTE_CACHE_LIMIT = 500;

async function cachedRoute(provider: RouteProvider, from: LatLng, to: LatLng): Promise<LatLng[] | null> {
  const key = `${from.latitude},${from.longitude}->${to.latitude},${to.longitude}`;
  if (routeCache.has(key)) return routeCache.get(key) ?? null;
  try {
    const route = await provider.route(from, to);
    if (routeCache.size >= ROUTE_CACHE_LIMIT) routeCache.clear();
    routeCache.set(key, route);
    return route;
  } catch (error) {
    logger.warn("Route lookup failed", { error: errorMessage(error) });
    return null;
  }
}

/** Map data and suggestions for the carpool page. */
export async function getCarpoolOverview(options: { routeProvider?: RouteProvider | null } = {}) {
  const settings = await getSettings();
  const venue = settings.practiceVenue;
  const locations = await prisma.memberLocation.findMany({
    where: { consentGiven: true, member: { deletedAt: null, status: { in: ["PROSPECTIVE", "ACTIVE"] } } },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, voiceType: true, whatsappNumber: true } },
    },
    orderBy: { areaLabel: "asc" },
  });

  const located: CarpoolPerson[] = locations
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
  const routeProvider =
    options.routeProvider === undefined ? (apiKey ? new OrsRouteProvider(apiKey) : null) : options.routeProvider;
  const routes = new Map<string, LatLng[]>();
  if (routeProvider) {
    const drivers = located.filter((person) => person.canDrive && person.seats > 0);
    for (const driver of drivers) {
      const route = await cachedRoute(routeProvider, driver, venue);
      if (route) routes.set(driver.id, route);
    }
  }

  const suggestions = suggestCarpools(
    located,
    venue,
    { clusterRadiusKm: settings.carpoolClusterRadiusKm, maxDetourKm: settings.carpoolMaxDetourKm },
    routes,
  );

  return {
    venue,
    people: located,
    routesEnabled: routeProvider !== null,
    whatsappById: Object.fromEntries(locations.map((location) => [location.member.id, location.member.whatsappNumber])),
    pending: locations.filter((location) => location.geocodeStatus === "PENDING").length,
    unlocated: locations
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
