import "server-only";
import { z } from "zod";
import type { Geocoder, GeocodeResult } from "../domain/ports";

const responseSchema = z.object({
  status: z.string(),
  error_message: z.string().optional(),
  results: z
    .array(
      z.object({
        formatted_address: z.string(),
        geometry: z.object({ location: z.object({ lat: z.number(), lng: z.number() }) }),
      }),
    )
    .default([]),
});

/**
 * Google Maps Geocoding API — knows local landmarks ("Arpico Dehiwala",
 * "Holy Family Convent") that OpenStreetMap often doesn't. Optional: only
 * used when GOOGLE_MAPS_API_KEY is set. Restricted to Sri Lanka.
 * https://developers.google.com/maps/documentation/geocoding/requests-geocoding
 */
export class GoogleGeocoder implements Geocoder {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async geocode(query: string): Promise<GeocodeResult | null> {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.search = new URLSearchParams({
      address: query,
      components: "country:LK",
      region: "lk",
      key: this.apiKey,
    }).toString();
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Google geocoding responded ${response.status}`);
    const body = responseSchema.parse(await response.json());
    if (body.status === "ZERO_RESULTS") return null;
    // REQUEST_DENIED (bad key / billing off), OVER_QUERY_LIMIT … → let the next geocoder try.
    if (body.status !== "OK") throw new Error(`Google geocoding: ${body.status} ${body.error_message ?? ""}`.trim());
    const first = body.results[0];
    if (!first) return null;
    return {
      latitude: first.geometry.location.lat,
      longitude: first.geometry.location.lng,
      displayName: first.formatted_address,
    };
  }
}
