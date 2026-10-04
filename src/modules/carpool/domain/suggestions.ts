import { distanceToPolylineKm, haversineKm, type LatLng } from "./geo";
import { googleMapsDirectionsUrl } from "./google-maps";

/**
 * Lifts home after practice (blueprint §5.5). Everyone starts at the venue;
 * each driver drops people off on the way to their own home.
 *
 * v1 (always): straight-line detour — a passenger fits a driver when dropping
 * them off adds at most `maxDetourKm` to the driver's trip home.
 * v2 (when a road route venue → driver's home is known): the passenger must
 * live within `corridorKm` of that route instead.
 *
 * People left without a driver are grouped with neighbours living within
 * `clusterRadiusKm` so they can share a ride or taxi home together.
 */

export interface CarpoolPerson extends LatLng {
  id: string;
  name: string;
  areaLabel: string;
  canDrive: boolean;
  seats: number;
}

export interface CarpoolOptions {
  clusterRadiusKm: number;
  maxDetourKm: number;
  corridorKm?: number;
}

export interface DriverGroup {
  driver: CarpoolPerson;
  passengers: CarpoolPerson[];
  /** Extra km versus the driver going straight home (straight-line estimate). */
  detourKm: number;
  matchedBy: "route" | "distance";
  googleMapsUrl: string;
}

export interface NeighbourGroup {
  members: CarpoolPerson[];
  centre: LatLng;
}

export interface CarpoolSuggestions {
  driverGroups: DriverGroup[];
  neighbourGroups: NeighbourGroup[];
  alone: CarpoolPerson[];
}

export const DEFAULT_CORRIDOR_KM = 1.5;

/** Length of start → stops (in order) → end, straight-line. */
export function tripKm(start: LatLng, stops: readonly LatLng[], end: LatLng): number {
  let total = 0;
  let current = start;
  for (const stop of stops) {
    total += haversineKm(current, stop);
    current = stop;
  }
  return total + haversineKm(current, end);
}

/** Visits stops nearest-first from `start` (good enough for ≤ 6 stops). */
export function orderStops<T extends LatLng>(start: LatLng, stops: readonly T[]): T[] {
  const remaining = [...stops];
  const ordered: T[] = [];
  let current: LatLng = start;
  while (remaining.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < remaining.length; i += 1) {
      if (haversineKm(current, remaining[i]!) < haversineKm(current, remaining[bestIndex]!)) bestIndex = i;
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next!);
    current = next!;
  }
  return ordered;
}

export function suggestCarpools(
  people: readonly CarpoolPerson[],
  venue: LatLng,
  options: CarpoolOptions,
  routes: ReadonlyMap<string, readonly LatLng[]> = new Map(),
): CarpoolSuggestions {
  const corridorKm = options.corridorKm ?? DEFAULT_CORRIDOR_KM;
  const drivers = people
    .filter((person) => person.canDrive && person.seats > 0)
    // Drivers living furthest away pass the most homes, so they choose first.
    .sort((a, b) => haversineKm(b, venue) - haversineKm(a, venue));
  const unassigned = new Map(people.filter((person) => !(person.canDrive && person.seats > 0)).map((p) => [p.id, p]));

  const driverGroups: DriverGroup[] = [];
  for (const driver of drivers) {
    const direct = haversineKm(driver, venue);
    const route = routes.get(driver.id);
    const fits = (candidate: CarpoolPerson) =>
      route
        ? distanceToPolylineKm(candidate, route) <= corridorKm
        : haversineKm(venue, candidate) + haversineKm(candidate, driver) - direct <= options.maxDetourKm;

    const candidates = [...unassigned.values()]
      .filter(fits)
      .sort(
        (a, b) => haversineKm(venue, a) + haversineKm(a, driver) - (haversineKm(venue, b) + haversineKm(b, driver)),
      );

    const passengers: CarpoolPerson[] = [];
    for (const candidate of candidates) {
      if (passengers.length >= driver.seats) break;
      const ordered = orderStops(venue, [...passengers, candidate]);
      // Keep the whole trip home reasonable, not just each stop on its own.
      if (!route && tripKm(venue, ordered, driver) - direct > options.maxDetourKm * 2) continue;
      passengers.push(candidate);
    }
    if (passengers.length === 0) continue;

    // Drop-off order: first stop nearest the venue, driver's home last.
    const ordered = orderStops(venue, passengers);
    for (const passenger of ordered) unassigned.delete(passenger.id);
    driverGroups.push({
      driver,
      passengers: ordered,
      detourKm: Math.max(0, tripKm(venue, ordered, driver) - direct),
      matchedBy: route ? "route" : "distance",
      googleMapsUrl: googleMapsDirectionsUrl(venue, driver, ordered),
    });
  }

  const { groups: neighbourGroups, alone } = clusterNeighbours([...unassigned.values()], options.clusterRadiusKm);
  return { driverGroups, neighbourGroups, alone };
}

/** Greedy clustering: each group is everyone within `radiusKm` of its seed. */
export function clusterNeighbours(
  people: readonly CarpoolPerson[],
  radiusKm: number,
): { groups: NeighbourGroup[]; alone: CarpoolPerson[] } {
  const remaining = [...people];
  const groups: NeighbourGroup[] = [];
  const alone: CarpoolPerson[] = [];

  while (remaining.length > 0) {
    // Seed with the person who has the most neighbours, so dense areas group first.
    let seedIndex = 0;
    let seedNeighbours = -1;
    remaining.forEach((person, index) => {
      const count = remaining.filter((other) => other !== person && haversineKm(person, other) <= radiusKm).length;
      if (count > seedNeighbours) {
        seedIndex = index;
        seedNeighbours = count;
      }
    });
    const seed = remaining[seedIndex]!;
    const members = remaining.filter((person) => haversineKm(seed, person) <= radiusKm);
    for (const member of members) remaining.splice(remaining.indexOf(member), 1);

    if (members.length === 1) {
      alone.push(seed);
      continue;
    }
    groups.push({
      members,
      centre: {
        latitude: members.reduce((sum, m) => sum + m.latitude, 0) / members.length,
        longitude: members.reduce((sum, m) => sum + m.longitude, 0) / members.length,
      },
    });
  }
  return { groups, alone };
}
