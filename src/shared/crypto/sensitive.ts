import "server-only";
import { parseCoordinates, type Coordinates } from "@/shared/lib/coordinates";
import { fieldCipher } from "./cipher";

/**
 * Helpers for the encrypted columns (see docs/adr/0008). Modules store
 * `…Encrypted` values and reveal them only when building what a page shows.
 */

export function seal(value: string): string {
  return fieldCipher().encrypt(value);
}

export function sealOptional(value: string | null | undefined): string | null {
  return fieldCipher().encryptOptional(value);
}

export function reveal(stored: string): string {
  return fieldCipher().decrypt(stored);
}

export function revealOptional(stored: string | null | undefined): string | null {
  return fieldCipher().decryptOptional(stored);
}

/** Keyed fingerprint of an already-normalised value (exact-match lookups without storing it). */
export function fingerprint(normalised: string): string {
  return fieldCipher().blindIndex(normalised);
}

/** Coordinates are stored as encrypted "lat,lng" text. */
export function sealCoordinates(point: Coordinates | null): string | null {
  return point ? seal(`${point.latitude},${point.longitude}`) : null;
}

export function revealCoordinates(stored: string | null | undefined): Coordinates | null {
  const text = revealOptional(stored);
  return text ? parseCoordinates(text) : null;
}

type StoredLocation = { areaLabelEncrypted: string; coordinatesEncrypted: string | null };

/** A member location with its area and coordinates decrypted. */
export function revealLocation<T extends StoredLocation>(
  location: T,
): Omit<T, keyof StoredLocation> & { areaLabel: string; latitude: number | null; longitude: number | null } {
  const { areaLabelEncrypted, coordinatesEncrypted, ...rest } = location;
  const point = revealCoordinates(coordinatesEncrypted);
  return {
    ...rest,
    areaLabel: reveal(areaLabelEncrypted),
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
  };
}
