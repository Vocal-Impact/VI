import { haversineKm, type LatLng } from "./geo";
import { googleMapsDirectionsUrl } from "./google-maps";

/**
 * Lifts home after practice (blueprint §5.5). Everyone starts at the venue;
 * each driver drops people off on the way to their own home.
 *
 * A passenger fits a driver when dropping them off adds at most
 * `maxDetourKm` to the driver's drive home. Distances come from a
 * `DistanceTable`: real road distances when a routing service is configured,
 * otherwise a straight-line estimate scaled by a typical road factor.
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
}

/** Id used for the venue in distance tables. */
export const VENUE_ID = "__venue__";

/** Road distance in km between two ids (people or VENUE_ID). Not necessarily symmetric. */
export interface DistanceTable {
  kind: "road" | "estimate";
  km(fromId: string, toId: string): number;
}

/**
 * Roads are rarely straight: in Colombo traffic routes are typically ~30%
 * longer than the straight line. Used only when no routing service is set up.
 */
export const ROAD_FACTOR = 1.3;

export function estimatedDistanceTable(people: readonly CarpoolPerson[], venue: LatLng): DistanceTable {
  const points = new Map<string, LatLng>([[VENUE_ID, venue], ...people.map((p) => [p.id, p] as [string, LatLng])]);
  return {
    kind: "estimate",
    km: (from, to) => haversineKm(points.get(from)!, points.get(to)!) * ROAD_FACTOR,
  };
}

/** Builds a table from a road-distance matrix whose rows/columns follow `ids`. Null cells fall back to the estimate. */
export function roadDistanceTable(
  ids: readonly string[],
  matrix: ReadonlyArray<ReadonlyArray<number | null>>,
  fallback: DistanceTable,
): DistanceTable {
  const index = new Map(ids.map((id, i) => [id, i]));
  return {
    kind: "road",
    km: (from, to) => {
      const value = matrix[index.get(from) ?? -1]?.[index.get(to) ?? -1];
      return typeof value === "number" ? value : fallback.km(from, to);
    },
  };
}

export interface DriverGroup {
  driver: CarpoolPerson;
  passengers: CarpoolPerson[];
  /** Driver's distance straight home from the venue. */
  directKm: number;
  /** Venue → drop-offs → driver's home. */
  tripKm: number;
  /** Extra distance versus going straight home. */
  detourKm: number;
  distanceKind: DistanceTable["kind"];
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

/** Length of start → stops (in order) → end. */
export function tripKm(distances: DistanceTable, startId: string, stopIds: readonly string[], endId: string): number {
  let total = 0;
  let current = startId;
  for (const stop of stopIds) {
    total += distances.km(current, stop);
    current = stop;
  }
  return total + distances.km(current, endId);
}

/** Visits stops nearest-first from `startId` (good enough for ≤ 6 stops). */
export function orderStops<T extends { id: string }>(
  distances: DistanceTable,
  startId: string,
  stops: readonly T[],
): T[] {
  const remaining = [...stops];
  const ordered: T[] = [];
  let current = startId;
  while (remaining.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < remaining.length; i += 1) {
      if (distances.km(current, remaining[i]!.id) < distances.km(current, remaining[bestIndex]!.id)) bestIndex = i;
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next!);
    current = next!.id;
  }
  return ordered;
}

export function suggestCarpools(
  people: readonly CarpoolPerson[],
  venue: LatLng,
  options: CarpoolOptions,
  distances: DistanceTable = estimatedDistanceTable(people, venue),
): CarpoolSuggestions {
  const drivers = people
    .filter((person) => person.canDrive && person.seats > 0)
    // Drivers living furthest away pass the most homes, so they choose first.
    .sort((a, b) => distances.km(VENUE_ID, b.id) - distances.km(VENUE_ID, a.id));
  const unassigned = new Map(people.filter((person) => !(person.canDrive && person.seats > 0)).map((p) => [p.id, p]));

  const driverGroups: DriverGroup[] = [];
  for (const driver of drivers) {
    const direct = distances.km(VENUE_ID, driver.id);
    const detourVia = (candidate: CarpoolPerson) =>
      distances.km(VENUE_ID, candidate.id) + distances.km(candidate.id, driver.id) - direct;

    const candidates = [...unassigned.values()]
      .filter((candidate) => detourVia(candidate) <= options.maxDetourKm)
      .sort((a, b) => detourVia(a) - detourVia(b));

    const passengers: CarpoolPerson[] = [];
    for (const candidate of candidates) {
      if (passengers.length >= driver.seats) break;
      const ordered = orderStops(distances, VENUE_ID, [...passengers, candidate]);
      // The whole trip home must stay within the detour limit, not just each stop.
      const extra =
        tripKm(
          distances,
          VENUE_ID,
          ordered.map((p) => p.id),
          driver.id,
        ) - direct;
      if (extra > options.maxDetourKm) continue;
      passengers.push(candidate);
    }
    if (passengers.length === 0) continue;

    // Drop-off order: first stop nearest the venue, driver's home last.
    const ordered = orderStops(distances, VENUE_ID, passengers);
    for (const passenger of ordered) unassigned.delete(passenger.id);
    const total = tripKm(
      distances,
      VENUE_ID,
      ordered.map((p) => p.id),
      driver.id,
    );
    driverGroups.push({
      driver,
      passengers: ordered,
      directKm: direct,
      tripKm: total,
      detourKm: Math.max(0, total - direct),
      distanceKind: distances.kind,
      googleMapsUrl: googleMapsDirectionsUrl(venue, driver, ordered),
    });
  }

  const { groups: neighbourGroups, alone } = clusterNeighbours([...unassigned.values()], options.clusterRadiusKm);
  return { driverGroups, neighbourGroups, alone };
}

/** Greedy clustering: each group is everyone within `radiusKm` (straight line) of its seed. */
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
