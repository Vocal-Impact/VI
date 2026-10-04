import { describe, expect, it } from "vitest";
import { distanceToPolylineKm, haversineKm, roundCoordinate } from "./geo";
import { googleMapsDirectionsUrl } from "./google-maps";
import { clusterNeighbours, suggestCarpools, type CarpoolPerson } from "./suggestions";

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
  // Moratuwa driver heading north to Colombo 06; Dehiwala & Mount Lavinia are on the way, Wattala is not.
  const driver = person("driver-moratuwa", 6.773, 79.882, 2);
  const onTheWay1 = person("mount-lavinia", 6.838, 79.866);
  const onTheWay2 = person("dehiwala", 6.851, 79.865);
  const offRoute = person("wattala", 6.989, 79.892);
  const options = { clusterRadiusKm: 3, maxDetourKm: 2 };

  it("drops people off on the driver's way home, nearest the venue first", () => {
    const result = suggestCarpools([driver, onTheWay2, offRoute, onTheWay1], venue, options);
    expect(result.driverGroups).toHaveLength(1);
    // Venue (Colombo 06) → Dehiwala → Mount Lavinia → driver's home in Moratuwa.
    expect(result.driverGroups[0]?.passengers.map((p) => p.id)).toEqual(["dehiwala", "mount-lavinia"]);
    expect(result.driverGroups[0]?.matchedBy).toBe("distance");
    const url = new URL(result.driverGroups[0]!.googleMapsUrl);
    expect(url.searchParams.get("origin")).toBe("6.868,79.859"); // starts at the venue
    expect(url.searchParams.get("destination")).toBe("6.773,79.882"); // ends at the driver's home
    expect(url.searchParams.get("waypoints")).toBe("6.851,79.865|6.838,79.866");
    expect(result.alone.map((p) => p.id)).toEqual(["wattala"]);
  });

  it("never exceeds the driver's seats", () => {
    const result = suggestCarpools([{ ...driver, seats: 1 }, onTheWay1, onTheWay2], venue, options);
    expect(result.driverGroups[0]?.passengers).toHaveLength(1);
  });

  it("uses the road route corridor when one is known", () => {
    const route = [
      { latitude: 6.773, longitude: 79.882 },
      { latitude: 6.95, longitude: 79.89 }, // detours north past Wattala's latitude band
      { latitude: 6.99, longitude: 79.892 },
      venue,
    ];
    const result = suggestCarpools([driver, offRoute], venue, options, new Map([[driver.id, route]]));
    expect(result.driverGroups[0]?.passengers.map((p) => p.id)).toEqual(["wattala"]);
    expect(result.driverGroups[0]?.matchedBy).toBe("route");
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
