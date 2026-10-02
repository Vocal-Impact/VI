import { describe, expect, it, vi } from "vitest";
import { NominatimGeocoder } from "./nominatim-geocoder";
import { OrsRouteProvider } from "./ors-route-provider";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("NominatimGeocoder", () => {
  it("queries Sri Lanka with the app User-Agent and parses the first hit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json([{ lat: "6.851", lon: "79.865", display_name: "Dehiwala, Sri Lanka" }]));
    const geocoder = new NominatimGeocoder("VocalImpactApp/test", fetchMock);

    await expect(geocoder.geocode("dehiwala, sri lanka")).resolves.toEqual({
      latitude: 6.851,
      longitude: 79.865,
      displayName: "Dehiwala, Sri Lanka",
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.searchParams.get("countrycodes")).toBe("lk");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("VocalImpactApp/test");
  });

  it("returns null when nothing is found and throws on HTTP errors", async () => {
    await expect(
      new NominatimGeocoder("ua", vi.fn().mockResolvedValue(json([]))).geocode("nowhere"),
    ).resolves.toBeNull();
    await expect(new NominatimGeocoder("ua", vi.fn().mockResolvedValue(json({}, 429))).geocode("x")).rejects.toThrow(
      "429",
    );
  });
});

describe("OrsRouteProvider", () => {
  it("converts GeoJSON [lng, lat] pairs to points", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        features: [
          {
            geometry: {
              coordinates: [
                [79.88, 6.77],
                [79.86, 6.87],
              ],
            },
          },
        ],
      }),
    );
    const route = await new OrsRouteProvider("key", fetchMock).route(
      { latitude: 6.77, longitude: 79.88 },
      { latitude: 6.87, longitude: 79.86 },
    );
    expect(route).toEqual([
      { latitude: 6.77, longitude: 79.88 },
      { latitude: 6.87, longitude: 79.86 },
    ]);
  });

  it("returns null when the service fails", async () => {
    const route = await new OrsRouteProvider("key", vi.fn().mockResolvedValue(json({ error: "quota" }, 403))).route(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 },
    );
    expect(route).toBeNull();
  });
});
