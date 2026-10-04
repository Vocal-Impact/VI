import { describe, expect, it } from "vitest";
import { distanceToPolylineKm, haversineKm, roundCoordinate } from "./geo";
import { googleMapsDirectionsUrl } from "./google-maps";
import {
  clusterNeighbours,
  estimatedDistanceTable,
  ROAD_FACTOR,
  roadDistanceTable,
  suggestCarpools,
  VENUE_ID,
  type CarpoolPerson,
} from "./suggestions";

const venue = { latitude: 6.868, longitude: 79.859 }; // Colombo 06

function person(id: string, latitude: number, longitude: number, seats = 0): CarpoolPerson {
  return { id, name: id, areaLabel: id, latitude, longitude, canDrive: seats > 0, seats };
}

describe("geo", () => {
  it("computes great-circle distance", () => {
    // Colombo Fort → Kandy ≈ 94 km as the crow flies.
    expect(haversineKm({ latitude: 6.9344, longitude: 79.8428 }, { latitude: 7.2906, longitude: 80.6337 })).toBeCloseTo(
      96,
      -1,
    );
    expect(haversineKm(venue, venue)).toBe(0);
  });
  it("rounds to ~100 m", () => {
    expect(roundCoordinate(6.871234)).toBe(6.871);
  });
  it("measures distance to a polyline", () => {
    const line = [
      { latitude: 6.8, longitude: 79.86 },
      { latitude: 6.9, longitude: 79.86 },
    ];
    expect(distanceToPolylineKm({ latitude: 6.85, longitude: 79.86 }, line)).toBeCloseTo(0, 3);
    expect(distanceToPolylineKm({ latitude: 6.85, longitude: 79.87 }, line)).toBeCloseTo(1.1, 1);
  });
});

describe("googleMapsDirectionsUrl", () => {
  it("builds a keyless directions link with waypoints", () => {
    const url = new URL(
      googleMapsDirectionsUrl({ latitude: 6.8, longitude: 79.9 }, venue, [{ latitude: 6.83, longitude: 79.88 }]),
    );
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("6.8,79.9");
    expect(url.searchParams.get("destination")).toBe("6.868,79.859");
    expect(url.searchParams.get("waypoints")).toBe("6.83,79.88");
    expect(url.searchParams.get("travelmode")).toBe("driving");
  });
});

describe("suggestCarpools", () => {
  // Moratuwa driver heading home south from Colombo 06; Dehiwala & Mount Lavinia are on the way, Wattala is not.
  const driver = person("driver-moratuwa", 6.773, 79.882, 2);
  const onTheWay1 = person("mount-lavinia", 6.838, 79.866);
  const onTheWay2 = person("dehiwala", 6.851, 79.865);
  const offRoute = person("wattala", 6.989, 79.892);
  const options = { clusterRadiusKm: 3, maxDetourKm: 2 };

  it("drops people off on the driver's way home, nearest the venue first", () => {
    const result = suggestCarpools([driver, onTheWay2, offRoute, onTheWay1], venue, options);
    expect(result.driverGroups).toHaveLength(1);
    const group = result.driverGroups[0]!;
    // Venue (Colombo 06) → Dehiwala → Mount Lavinia → driver's home in Moratuwa.
    expect(group.passengers.map((p) => p.id)).toEqual(["dehiwala", "mount-lavinia"]);
    expect(group.distanceKind).toBe("estimate");
    expect(group.detourKm).toBeLessThanOrEqual(options.maxDetourKm);
    const url = new URL(group.googleMapsUrl);
    expect(url.searchParams.get("origin")).toBe("6.868,79.859"); // starts at the venue
    expect(url.searchParams.get("destination")).toBe("6.773,79.882"); // ends at the driver's home
    expect(url.searchParams.get("waypoints")).toBe("6.851,79.865|6.838,79.866");
    expect(result.alone.map((p) => p.id)).toEqual(["wattala"]);
  });

  it("estimates road distance as straight line × the road factor", () => {
    const table = estimatedDistanceTable([driver], venue);
    expect(table.km(VENUE_ID, driver.id)).toBeCloseTo(haversineKm(venue, driver) * ROAD_FACTOR, 6);
  });

  it("never exceeds the driver's seats", () => {
    const result = suggestCarpools([{ ...driver, seats: 1 }, onTheWay1, onTheWay2], venue, options);
    expect(result.driverGroups[0]?.passengers).toHaveLength(1);
  });

  it("uses real road distances when available — a short straight line can still be a long drive", () => {
    // Straight-line, the passenger looks on the way. By road (e.g. across a canal with no bridge) it's a 6 km detour.
    const passenger = person("across-canal", 6.82, 79.87);
    const ids = [VENUE_ID, driver.id, passenger.id];
    const estimate = estimatedDistanceTable([driver, passenger], venue);
    const road = roadDistanceTable(
      ids,
      [
        [0, 12, 8],
        [12, 0, 10],
        [8, 10, 0],
      ],
      estimate,
    );
    expect(suggestCarpools([driver, passenger], venue, options).driverGroups).toHaveLength(1); // estimate says yes
    const result = suggestCarpools([driver, passenger], venue, options, road);
    expect(result.driverGroups).toHaveLength(0); // roads say no: 8 + 10 − 12 = 6 km > 2 km
    expect(result.alone.map((p) => p.id)).toEqual(["across-canal"]);

    // With a real road detour of 1 km, they match and the figures are road kilometres.
    const close = roadDistanceTable(
      ids,
      [
        [0, 12, 5],
        [12, 0, 8],
        [5, 8, 0],
      ],
      estimate,
    );
    const matched = suggestCarpools([driver, passenger], venue, options, close).driverGroups[0]!;
    expect(matched).toMatchObject({ distanceKind: "road", directKm: 12, tripKm: 13, detourKm: 1 });
  });

  it("falls back to the estimate for pairs the road service couldn't route", () => {
    const estimate = estimatedDistanceTable([driver], venue);
    const table = roadDistanceTable(
      [VENUE_ID, driver.id],
      [
        [0, null],
        [null, 0],
      ],
      estimate,
    );
    expect(table.km(VENUE_ID, driver.id)).toBeCloseTo(estimate.km(VENUE_ID, driver.id), 6);
  });

  it("groups neighbours without a driver", () => {
    const { groups, alone } = clusterNeighbours(
      [person("a", 6.85, 79.865), person("b", 6.855, 79.866), person("c", 6.99, 79.89)],
      3,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.members.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(alone.map((p) => p.id)).toEqual(["c"]);
  });
});
