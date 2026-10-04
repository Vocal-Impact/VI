export interface Coordinates {
  latitude: number;
  longitude: number;
}

const NUMBER = String.raw`[-+]?\d+(?:\.\d+)?`;
const PAIR = new RegExp(`^\\(?\\s*(${NUMBER})\\s*[,\\s]\\s*(${NUMBER})\\s*\\)?$`);

/**
 * Parses coordinates as copied from Google Maps ("6.8953861, 79.8556737"),
 * also accepting a space instead of the comma or surrounding brackets.
 * Rounds to 6 decimals (~10 cm). Returns null when it isn't a valid pair.
 */
export function parseCoordinates(text: string): Coordinates | null {
  const match = PAIR.exec(text.trim());
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return { latitude: round(latitude), longitude: round(longitude) };
}

export function formatCoordinates({ latitude, longitude }: Coordinates): string {
  return `${latitude}, ${longitude}`;
}
