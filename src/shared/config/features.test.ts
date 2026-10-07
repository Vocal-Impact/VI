import { describe, expect, it } from "vitest";
import { parseFlag } from "./features";

describe("parseFlag", () => {
  it("is on unless explicitly switched off", () => {
    for (const on of [undefined, "", "true", "1", "TRUE", " yes "]) expect(parseFlag(on)).toBe(true);
    for (const off of ["false", "0", "off", "no", " FALSE "]) expect(parseFlag(off)).toBe(false);
  });
});
