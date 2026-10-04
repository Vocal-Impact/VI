/**
 * Turning what people type ("Kohuwala Jn", "near Dehiwala zoo") into search
 * queries that OpenStreetMap-based geocoders understand. Pure.
 */

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bjn\b\.?/gi, "junction"],
  [/\bjct\b\.?/gi, "junction"],
  [/\brd\b\.?/gi, "road"],
  [/\bmw\b\.?/gi, "mawatha"],
  [/\bstn\b\.?/gi, "station"],
];

const FILLER = /^(near|close to|around|opposite|behind|next to)\s+/i;

/** Cleans up a typed area: expands common abbreviations and drops filler like "near". */
export function normaliseArea(area: string): string {
  let value = area.trim().replace(/\s+/g, " ").replace(FILLER, "");
  for (const [pattern, replacement] of ABBREVIATIONS) value = value.replace(pattern, replacement);
  return value.trim();
}

/** Queries to try, most specific first, without duplicates. */
export function geocodeQueries(area: string): string[] {
  const cleaned = normaliseArea(area);
  const candidates = [cleaned, `${cleaned}, Sri Lanka`];
  // "Kohuwala junction, Nugegoda" → also try just "Kohuwala junction" and "Nugegoda".
  if (cleaned.includes(",")) {
    for (const part of cleaned.split(",")) if (part.trim().length > 2) candidates.push(part.trim());
  }
  const seen = new Set<string>();
  return candidates.filter((query) => {
    const key = query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Cache key for an area, so "Dehiwala" and " dehiwala " share one lookup. */
export function geocodeCacheKey(area: string): string {
  return normaliseArea(area).toLowerCase();
}
