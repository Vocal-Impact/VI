import "server-only";
import { z } from "zod";
import type { Geocoder, GeocodeResult } from "../domain/ports";

const responseSchema = z.array(
  z.object({
    lat: z.coerce.number(),
    lon: z.coerce.number(),
    display_name: z.string(),
  }),
);

/**
 * OpenStreetMap Nominatim. Usage policy: ≤ 1 request/second, identify the app
 * with a User-Agent, cache results (done by the caller via GeocodeCache).
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export class NominatimGeocoder implements Geocoder {
  constructor(
    private readonly userAgent: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async geocode(query: string): Promise<GeocodeResult | null> {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", countrycodes: "lk" }).toString();
    const response = await this.fetchImpl(url, {
      headers: { "User-Agent": this.userAgent, "Accept-Language": "en" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Nominatim responded ${response.status}`);
    const results = responseSchema.parse(await response.json());
    const first = results[0];
    return first ? { latitude: first.lat, longitude: first.lon, displayName: first.display_name } : null;
  }
}
