import { describe, expect, it } from "vitest";
import { pageNumbers } from "./pagination";

describe("pageNumbers", () => {
  it("shows the first, the last and the pages around the current one", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(6, 12)).toEqual([1, "…", 5, 6, 7, "…", 12]);
    expect(pageNumbers(1, 12)).toEqual([1, 2, "…", 12]);
    expect(pageNumbers(12, 12)).toEqual([1, "…", 11, 12]);
  });

  it("shows a single missing page instead of …", () => {
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
