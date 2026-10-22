import "server-only";
import { getEnv } from "./env";

/**
 * Feature flags, set per environment (e.g. in Vercel) so unfinished features
 * can stay hidden in production while they're worked on locally.
 *
 *   FEATURE_LIFTS_HOME=false   → hides "Lifts home" (carpool planning)
 *   FEATURE_SONG_BANK=false    → hides the "Song bank" (recordings and sheet music)
 *
 * Flags are on unless set to "false" or "0".
 */
export type Feature = "liftsHome" | "songBank";

export function parseFlag(value: string | undefined): boolean {
  const normalised = (value ?? "").trim().toLowerCase();
  return !(normalised === "false" || normalised === "0" || normalised === "off" || normalised === "no");
}

export function isFeatureEnabled(feature: Feature): boolean {
  const env = getEnv();
  switch (feature) {
    case "liftsHome":
      return parseFlag(env.FEATURE_LIFTS_HOME);
    case "songBank":
      return parseFlag(env.FEATURE_SONG_BANK);
  }
}
