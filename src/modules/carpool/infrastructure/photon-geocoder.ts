import "server-only";
import { z } from "zod";
import type { LatLng } from "../domain/geo";
import type { Geocoder, GeocodeResult } from "../domain/ports";

/** Sri Lanka bounding box: minLon, minLat, maxLon, maxLat. */
const SRI_LANKA_BBOX = "79.5,5.85,81.95,9.85";

const responseSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z
        .object({ name: z.string().optional(), city: z.string().optional(), district: z.string().optional() })
        .passthrough(),
    }),
  ),
});

/**
 * Photon (komoot) — OpenStreetMap search that tolerates typos and finds
 * landmarks better than Nominatim. Free, no key; fair use only.
 * Results are limited to Sri Lanka and biased towards the practice venue.
 * https://photon.komoot.io
 */
export class PhotonGeocoder implements Geocoder {
  constructor(
    private readonly userAgent: string,
    private readonly bias: LatLng | null = null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async geocode(query: string): Promise<GeocodeResult | null> {
    const url = new URL("https://photon.komoot.io/api/");
    const params = new URLSearchParams({ q: query, limit: "1", lang: "en", bbox: SRI_LANKA_BBOX });
    if (this.bias) {
      params.set("lat", String(this.bias.latitude));
      params.set("lon", String(this.bias.longitude));
    }
    url.search = params.toString();
    const response = await this.fetchImpl(url, {
      headers: { "User-Agent": this.userAgent },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Photon responded ${response.status}`);
    const parsed = responseSchema.parse(await response.json());
    const first = parsed.features[0];
    if (!first) return null;
    const [longitude, latitude] = first.geometry.coordinates;
    const { name, city, district } = first.properties;
    return { latitude, longitude, displayName: [name, district ?? city].filter(Boolean).join(", ") || query };
  }
}
