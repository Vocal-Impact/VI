# 4. OpenStreetMap in the app, Google Maps via links

- **Status:** Accepted (2026-10-02)

## Context

Every Google Maps Platform API needs a billing account with a card. Our rule is no payments.

## Decision

- **Map display:** Leaflet with OpenStreetMap tiles.
- **Geocoding:** Nominatim. Results are cached in `geocode_cache`, requests are throttled to 1 per second, and coordinates are rounded to about 100 m.
- **Routing (optional):** OpenRouteService.
- **Navigation:** handed to Google Maps through keyless `https://www.google.com/maps/dir/?api=1…` links.

## Update (2026-10-04)

OpenStreetMap misses many Sri Lankan landmarks, so a **Google Maps Geocoding API** key can optionally be set with `GOOGLE_MAPS_API_KEY`. Lookups then try Google first, falling back to Nominatim and Photon. It needs a Google Cloud billing account, but its free monthly allowance covers a choir many times over; set a budget alert. Without a key nothing changes.

## Consequences

- **Cost:** nothing, and no card on file.
- **Familiar navigation:** members still navigate in Google Maps.
- **Limits:** OSM usage policies (tiles and Nominatim) cap us at light use, which is plenty for a choir.
