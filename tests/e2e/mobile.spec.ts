import { expect, test } from "@playwright/test";
import { confirmDialog, isoDaysAgo, openDashboard } from "./helpers";

test("navigation works on a phone", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Practices", exact: true }).click();
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

test("tapping a birthday on the calendar shows who it is", async ({ page }) => {
  await openDashboard(page);
  // Give a member a birthday today (this year's date with a 2004 birth year).
  const today = isoDaysAgo(0);
  await page.goto("/members?q=mala");
  await page.getByRole("link", { name: "Mala Member" }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Date of birth (optional)").fill(`2004${today.slice(4)}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await confirmDialog(page);
  await expect(page.getByRole("heading", { level: 1, name: "Mala Member" })).toBeVisible();

  await page.goto("/birthdays");
  const day = page.getByRole("button", { name: /Mala Member$/ });
  await day.tap();
  const details = page.locator("#birthday-details");
  await expect(details.getByText("🎂 Mala Member")).toBeVisible();
  await expect(details.getByRole("link", { name: "Open profile" })).toBeVisible();
  await day.tap(); // tap again to close
  await expect(details.getByText("🎂 Mala Member")).toHaveCount(0);

  // Put it back for other tests.
  await page.goto("/members?q=mala");
  await page.getByRole("link", { name: "Mala Member" }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Date of birth (optional)").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await confirmDialog(page);
  await expect(page.getByRole("heading", { level: 1, name: "Mala Member" })).toBeVisible();
});
