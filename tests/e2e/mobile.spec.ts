import { expect, test } from "@playwright/test";
import { openDashboard } from "./helpers";

test("navigation works on a phone", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Practices" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Practices" })).toBeVisible();
  // No horizontal scrolling at phone width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test.describe("signed out on an iPhone XR", () => {
  // Safari's visible area on an iPhone XR (414 × 896 screen, minus the browser bars).
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 414, height: 715 } });

  test("the sign-in page fits the screen without scrolling", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("Backstage", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeInViewport();
    await expect(page.getByText(/Only committee members/)).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/sign-in-iphone-xr.png" });
  });
});
