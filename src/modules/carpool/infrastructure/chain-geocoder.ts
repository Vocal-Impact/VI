import "server-only";
import { errorMessage, logger } from "@/shared/lib/logger";
import { geocodeQueries } from "../domain/geocoding";
import type { Geocoder, GeocodeResult } from "../domain/ports";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tries each query variant against each geocoder until one finds the place.
 * Waits `intervalMs` between outbound requests to respect the free services'
 * fair-use limits (Nominatim: 1 request/second).
 */
export class ChainGeocoder implements Geocoder {
  private lastCall = 0;

  constructor(
    private readonly geocoders: readonly Geocoder[],
    private readonly intervalMs = 1100,
  ) {}

  private async throttle(): Promise<void> {
    const wait = this.lastCall + this.intervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCall = Date.now();
  }

  async geocode(area: string): Promise<GeocodeResult | null> {
    let lastError: unknown = null;
    let anyAnswered = false;
    for (const query of geocodeQueries(area)) {
      for (const geocoder of this.geocoders) {
        await this.throttle();
        try {
          const result = await geocoder.geocode(query);
          anyAnswered = true;
          if (result) return result;
        } catch (error) {
          lastError = error;
          logger.warn("Geocoder failed, trying the next one", { error: errorMessage(error) });
        }
      }
    }
    // Only report a failure (retry later) if no service answered at all.
    if (!anyAnswered && lastError) throw lastError;
    return null;
  }
}
