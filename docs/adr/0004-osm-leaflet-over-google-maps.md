# 4. OpenStreetMap in the app, Google Maps via links

- **Status:** Accepted (2026-10-02)

## Context

Every Google Maps Platform API needs a billing account with a card. Our rule is no payments.

## Decision

- **Map display:** Leaflet with OpenStreetMap tiles.
- **Geocoding:** Nominatim. Results are cached in `geocode_cache`, requests are throttled to 1 per second, and coordinates are rounded to about 100 m.
- **Routing (optional):** OpenRouteService.
- **Navigation:** handed to Google Maps through keyless `https://www.google.com/maps/dir/?api=1…` links.

## Consequences

- **Cost:** nothing, and no card on file.
- **Familiar navigation:** members still navigate in Google Maps.
- **Limits:** OSM usage policies (tiles and Nominatim) cap us at light use, which is plenty for a choir.
