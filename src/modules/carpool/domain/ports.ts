import type { LatLng } from "./geo";

export interface GeocodeResult extends LatLng {
  displayName: string;
}

/** Port: turns an area name into coordinates. Production adapter: Nominatim. */
export interface Geocoder {
  geocode(query: string): Promise<GeocodeResult | null>;
}

/** Port: driving route geometry. Production adapter: OpenRouteService (optional). */
export interface RouteProvider {
  route(from: LatLng, to: LatLng): Promise<LatLng[] | null>;
}
