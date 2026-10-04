import "server-only";
import { z } from "zod";
import type { LatLng } from "../domain/geo";
import type { RoadRoute, RouteProvider } from "../domain/ports";

const BASE_URL = "https://api.openrouteservice.org/v2";

/** Free plan: all-to-all matrices up to 3,500 pairs (59 × 59 points). */
export const MAX_MATRIX_POINTS = 59;

const matrixSchema = z.object({ distances: z.array(z.array(z.number().nullable())) });

const directionsSchema = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()]).rest(z.number())) }),
        properties: z.object({ summary: z.object({ distance: z.number(), duration: z.number() }) }),
      }),
    )
    .min(1),
});

/** ORS expects [longitude, latitude]. */
const toLngLat = (point: LatLng) => [point.longitude, point.latitude];

/**
 * OpenRouteService driving distances and routes (free key, no card).
 * https://openrouteservice.org/plans/ — Matrix 500/day, Directions 2,000/day.
 */
export class OrsRouteProvider implements RouteProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private post(path: string, body: unknown): Promise<Response> {
    return this.fetchImpl(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  }

  async distanceMatrix(points: readonly LatLng[]): Promise<Array<Array<number | null>> | null> {
    if (points.length < 2 || points.length > MAX_MATRIX_POINTS) return null;
    const response = await this.post("/matrix/driving-car", {
      locations: points.map(toLngLat),
      metrics: ["distance"],
      units: "km",
    });
    if (!response.ok) return null;
    const parsed = matrixSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.distances : null;
  }

  async route(points: readonly LatLng[]): Promise<RoadRoute | null> {
    if (points.length < 2) return null;
    const response = await this.post("/directions/driving-car/geojson", { coordinates: points.map(toLngLat) });
    if (!response.ok) return null;
    const parsed = directionsSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const feature = parsed.data.features[0]!;
    return {
      geometry: feature.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
      distanceKm: feature.properties.summary.distance / 1000,
      durationMin: feature.properties.summary.duration / 60,
    };
  }
}
