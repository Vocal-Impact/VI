import "server-only";
import { z } from "zod";
import type { LatLng } from "../domain/geo";
import type { RouteProvider } from "../domain/ports";

const responseSchema = z.object({
  features: z
    .array(z.object({ geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }) }))
    .min(1),
});

/** OpenRouteService driving directions (free key, ~2,000 requests/day). */
export class OrsRouteProvider implements RouteProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async route(from: LatLng, to: LatLng): Promise<LatLng[] | null> {
    const response = await this.fetchImpl("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: { Authorization: this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [
          [from.longitude, from.latitude],
          [to.longitude, to.latitude],
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return parsed.data.features[0]!.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
  }
}
