import { describe, expect, it } from "vitest";
import { formatCoordinates, parseCoordinates } from "./coordinates";

describe("parseCoordinates", () => {
  it("accepts the full-precision pair copied from Google Maps and rounds it", () => {
    expect(parseCoordinates("6.895386124694451, 79.85567372806051")).toEqual({
      latitude: 6.895386,
      longitude: 79.855674,
    });
  });

  it("accepts spaces, brackets and signs", () => {
    expect(parseCoordinates("  (6.9, 79.86) ")).toEqual({ latitude: 6.9, longitude: 79.86 });
    expect(parseCoordinates("6.9 79.86")).toEqual({ latitude: 6.9, longitude: 79.86 });
    expect(parseCoordinates("-33.86, 151.2")).toEqual({ latitude: -33.86, longitude: 151.2 });
  });

  it("rejects things that aren't a coordinate pair", () => {
    expect(parseCoordinates("6.895386124694451")).toBeNull();
    expect(parseCoordinates("Colombo")).toBeNull();
    expect(parseCoordinates("95, 79")).toBeNull();
    expect(parseCoordinates("6.9, 200")).toBeNull();
  });

  it("formats back into the same style", () => {
    expect(formatCoordinates({ latitude: 6.895386, longitude: 79.855674 })).toBe("6.895386, 79.855674");
  });
});
