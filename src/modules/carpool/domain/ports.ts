import type { LatLng } from "./geo";

export interface GeocodeResult extends LatLng {
  displayName: string;
}

/** Port: turns an area name into coordinates. Production adapter: Nominatim. */
export interface Geocoder {
  geocode(query: string): Promise<GeocodeResult | null>;
}

export interface RoadRoute {
  /** The route along real roads, for drawing on the map. */
  geometry: LatLng[];
  distanceKm: number;
  durationMin: number;
}

/** Port: real road distances and routes. Production adapter: OpenRouteService (optional). */
export interface RouteProvider {
  /** All-to-all driving distances in km (null where no road route exists), or null on failure. */
  distanceMatrix(points: readonly LatLng[]): Promise<Array<Array<number | null>> | null>;
  /** Driving route through the points in order, or null on failure. */
  route(points: readonly LatLng[]): Promise<RoadRoute | null>;
}
