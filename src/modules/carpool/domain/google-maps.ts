import type { LatLng } from "./geo";

const format = (point: LatLng) => `${point.latitude},${point.longitude}`;

/**
 * Google Maps directions deep link — free, no API key
 * (https://developers.google.com/maps/documentation/urls/get-started).
 */
export function googleMapsDirectionsUrl(
  origin: LatLng,
  destination: LatLng,
  waypoints: readonly LatLng[] = [],
): string {
  const params = new URLSearchParams({
    api: "1",
    origin: format(origin),
    destination: format(destination),
    travelmode: "driving",
  });
  if (waypoints.length > 0) params.set("waypoints", waypoints.map(format).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
