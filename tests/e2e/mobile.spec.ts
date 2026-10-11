import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { confirmDialog, isoDaysAgo, openDashboard, openFormDialog } from "./helpers";

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
  let form = await openFormDialog(page, "Edit");
  await form.getByLabel("Date of birth (optional)").fill(`2004${today.slice(4)}`);
  await form.getByRole("button", { name: "Save changes" }).click();
  await confirmDialog(page);
  await expect(form).toBeHidden();

  await page.goto("/birthdays");
  const day = page.getByRole("button", { name: /Mala Member$/ });
  await day.tap();
  // A card opens over the calendar next to the day, fully on screen.
  const card = page.getByRole("dialog", { name: /^Birthdays on / });
  await expect(card.getByText("🎂 Mala Member")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open profile" })).toBeVisible();
  // Measure once the pop-in animation (which briefly overshoots) has finished.
  await card.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const box = await card.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  // Tapping outside closes it.
  await page.mouse.click(5, 5);
  await expect(card).toHaveCount(0);

  // Put it back for other tests.
  await page.goto("/members?q=mala");
  await page.getByRole("link", { name: "Mala Member" }).click();
  form = await openFormDialog(page, "Edit");
  await form.getByLabel("Date of birth (optional)").fill("");
  await form.getByRole("button", { name: "Save changes" }).click();
  await confirmDialog(page);
  await expect(form).toBeHidden();
});

test("the dashboard fits a phone even with a long import file name", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/members/import");
  await page.getByLabel("CSV file").setInputFiles({
    name: "VI - Member Information Collection Form (Responses) - Form Responses 1 (1).csv",
    mimeType: "text/csv",
    buffer: readFileSync("tests/fixtures/registration-form-2026.csv"),
  });
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.getByRole("button", { name: /^Import \d+ row/ }).click();
  await confirmDialog(page);
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("VI - Member Information Collection Form", { exact: false })).toBeAttached();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("on a phone, adding opens as a sheet that fits the screen", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/attendance");
  const sheet = await openFormDialog(page, "Schedule practice");
  // Measured once the slide-up has finished.
  await sheet.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(Math.abs(box!.y + box!.height - viewport!.height)).toBeLessThanOrEqual(1); // sits on the bottom edge
  await page.screenshot({ path: "test-results/schedule-sheet-phone.png" });
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
});
