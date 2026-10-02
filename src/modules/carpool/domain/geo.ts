export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Privacy: 3 decimal places ≈ 110 m, enough for carpooling, not an address. */
export function roundCoordinate(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function roundLatLng(point: LatLng): LatLng {
  return { latitude: roundCoordinate(point.latitude), longitude: roundCoordinate(point.longitude) };
}

/**
 * Distance from a point to a line segment in km, using a local equirectangular
 * projection (accurate to well under 1% over city distances).
 */
export function distanceToSegmentKm(point: LatLng, start: LatLng, end: LatLng): number {
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.32 * Math.cos(toRadians(point.latitude));
  const project = (p: LatLng) => ({ x: p.longitude * kmPerDegLng, y: p.latitude * kmPerDegLat });
  const p = project(point);
  const a = project(start);
  const b = project(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Shortest distance from a point to a route polyline, in km. */
export function distanceToPolylineKm(point: LatLng, polyline: readonly LatLng[]): number {
  if (polyline.length === 0) return Number.POSITIVE_INFINITY;
  if (polyline.length === 1) return haversineKm(point, polyline[0]!);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < polyline.length; i += 1) {
    best = Math.min(best, distanceToSegmentKm(point, polyline[i - 1]!, polyline[i]!));
  }
  return best;
}
