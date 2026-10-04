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
