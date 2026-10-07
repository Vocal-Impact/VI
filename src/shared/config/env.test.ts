import { describe, expect, it } from "vitest";
import { resolveAppUrl } from "./env";

describe("resolveAppUrl", () => {
  it("prefers BETTER_AUTH_URL (custom domains)", () => {
    expect(
      resolveAppUrl({ BETTER_AUTH_URL: "https://choir.example.lk", VERCEL_PROJECT_PRODUCTION_URL: "vi.vercel.app" }),
    ).toBe("https://choir.example.lk");
  });

  it("falls back to the address Vercel provides", () => {
    expect(
      resolveAppUrl({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "vi.vercel.app",
        VERCEL_URL: "vi-abc123.vercel.app",
      }),
    ).toBe("https://vi.vercel.app");
    expect(resolveAppUrl({ VERCEL_ENV: "preview", VERCEL_URL: "vi-abc123.vercel.app" })).toBe(
      "https://vi-abc123.vercel.app",
    );
  });

  it("is undefined when nothing is set (the env check then reports it)", () => {
    expect(resolveAppUrl({})).toBeUndefined();
  });
});
