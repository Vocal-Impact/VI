import { describe, expect, it, vi } from "vitest";
import { NominatimGeocoder } from "./nominatim-geocoder";
import { OrsRouteProvider } from "./ors-route-provider";
import { PhotonGeocoder } from "./photon-geocoder";
import { ChainGeocoder } from "./chain-geocoder";

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
  const a = { latitude: 6.868, longitude: 79.859 };
  const b = { latitude: 6.773, longitude: 79.882 };

  it("asks for an all-to-all driving distance matrix in km, sending [longitude, latitude]", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        distances: [
          [0, 12.4],
          [12.9, 0],
        ],
      }),
    );
    const matrix = await new OrsRouteProvider("key", fetchMock).distanceMatrix([a, b]);
    expect(matrix).toEqual([
      [0, 12.4],
      [12.9, 0],
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openrouteservice.org/v2/matrix/driving-car");
    expect((init.headers as Record<string, string>).Authorization).toBe("key");
    expect(JSON.parse(init.body as string)).toEqual({
      locations: [
        [79.859, 6.868],
        [79.882, 6.773],
      ],
      metrics: ["distance"],
      units: "km",
    });
  });

  it("returns the road route through all stops with distance and duration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        features: [
          {
            geometry: {
              coordinates: [
                [79.859, 6.868],
                [79.87, 6.82],
                [79.882, 6.773],
              ],
            },
            properties: { summary: { distance: 13250, duration: 1500 } },
          },
        ],
      }),
    );
    const route = await new OrsRouteProvider("key", fetchMock).route([a, b]);
    expect(route).toEqual({
      geometry: [
        { latitude: 6.868, longitude: 79.859 },
        { latitude: 6.82, longitude: 79.87 },
        { latitude: 6.773, longitude: 79.882 },
      ],
      distanceKm: 13.25,
      durationMin: 25,
    });
  });

  it("returns null when the service fails or there are too many points for the free plan", async () => {
    const failing = new OrsRouteProvider("key", vi.fn().mockResolvedValue(json({ error: "quota" }, 403)));
    expect(await failing.distanceMatrix([a, b])).toBeNull();
    expect(await failing.route([a, b])).toBeNull();
    const fetchMock = vi.fn();
    const tooMany = Array.from({ length: 60 }, () => a);
    expect(await new OrsRouteProvider("key", fetchMock).distanceMatrix(tooMany)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PhotonGeocoder", () => {
  it("searches within Sri Lanka, biased towards the venue, and reads [lon, lat]", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        features: [
          {
            geometry: { coordinates: [79.8774, 6.8664] },
            properties: { name: "Kohuwala Junction", district: "Nugegoda" },
          },
        ],
      }),
    );
    const geocoder = new PhotonGeocoder("ua", { latitude: 6.895, longitude: 79.855 }, fetchMock);
    await expect(geocoder.geocode("Kohuwala junction")).resolves.toEqual({
      latitude: 6.8664,
      longitude: 79.8774,
      displayName: "Kohuwala Junction, Nugegoda",
    });
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.get("bbox")).toBe("79.5,5.85,81.95,9.85");
    expect(url.searchParams.get("lat")).toBe("6.895");
  });

  it("returns null when nothing matches", async () => {
    const geocoder = new PhotonGeocoder("ua", null, vi.fn().mockResolvedValue(json({ features: [] })));
    await expect(geocoder.geocode("nowhere")).resolves.toBeNull();
  });
});

describe("ChainGeocoder", () => {
  const hit = { latitude: 6.86, longitude: 79.87, displayName: "Found" };

  it("falls back to the next service and the next query variant", async () => {
    const strict = { geocode: vi.fn().mockResolvedValue(null) };
    const forgiving = {
      geocode: vi.fn().mockImplementation(async (q: string) => (q === "Kohuwala junction" ? hit : null)),
    };
    const chain = new ChainGeocoder([strict, forgiving], 0);
    await expect(chain.geocode("Kohuwala Jn")).resolves.toEqual(hit);
    expect(strict.geocode).toHaveBeenCalledWith("Kohuwala junction");
    expect(forgiving.geocode).toHaveBeenCalledWith("Kohuwala junction");
  });

  it("keeps going when one service errors, and only throws if every service failed", async () => {
    const broken = { geocode: vi.fn().mockRejectedValue(new Error("429")) };
    const working = { geocode: vi.fn().mockResolvedValue(hit) };
    await expect(new ChainGeocoder([broken, working], 0).geocode("Dehiwala")).resolves.toEqual(hit);
    await expect(new ChainGeocoder([broken], 0).geocode("Dehiwala")).rejects.toThrow("429");
    const empty = { geocode: vi.fn().mockResolvedValue(null) };
    await expect(new ChainGeocoder([broken, empty], 0).geocode("Atlantis")).resolves.toBeNull();
  });
});
