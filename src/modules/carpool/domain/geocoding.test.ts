import { describe, expect, it } from "vitest";
import { geocodeCacheKey, geocodeQueries, normaliseArea } from "./geocoding";

describe("normaliseArea", () => {
  it("expands common abbreviations and drops filler words", () => {
    expect(normaliseArea("Kohuwala Jn")).toBe("Kohuwala junction");
    expect(normaliseArea("near  Dehiwala Zoo")).toBe("Dehiwala Zoo");
    expect(normaliseArea("Galle Rd, Wellawatte")).toBe("Galle road, Wellawatte");
    expect(normaliseArea("Fort Stn")).toBe("Fort station");
  });
});

describe("geocodeQueries", () => {
  it("tries the cleaned text, then with Sri Lanka, then each comma-separated part", () => {
    expect(geocodeQueries("Kohuwala Jn, Nugegoda")).toEqual([
      "Kohuwala junction, Nugegoda",
      "Kohuwala junction, Nugegoda, Sri Lanka",
      "Kohuwala junction",
      "Nugegoda",
    ]);
  });

  it("doesn't repeat queries", () => {
    expect(geocodeQueries("Dehiwala")).toEqual(["Dehiwala", "Dehiwala, Sri Lanka"]);
  });

  it("shares a cache key across spacing and case", () => {
    expect(geocodeCacheKey("  dehiwala ")).toBe(geocodeCacheKey("Dehiwala"));
  });
});
