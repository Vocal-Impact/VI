import { expect, test } from "@playwright/test";
import { openDashboard } from "./helpers";

test("the birthdays notice links to the members missing a birthday", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/birthdays");
  await page.getByRole("link", { name: "See who" }).click();
  await expect(page).toHaveURL(/\/members\?missing=birthday/);
  await expect(page.getByText(/Showing current members with no birthday on file/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Mala Member" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Asha Alumna" })).toHaveCount(0); // alumni aren't counted
});

test("Ready for WhatsApp lives in the WhatsApp section", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/whatsapp-groups");
  await page.getByRole("link", { name: /^Ready for WhatsApp/ }).click();
  await expect(page).toHaveURL(/\/whatsapp-groups\/ready$/);
  await expect(page.getByRole("link", { name: "← WhatsApp groups" })).toBeVisible();
  await page.goto("/attendance");
  await expect(page.getByRole("link", { name: /^Ready for WhatsApp/ })).toHaveCount(0);
  // Old bookmarks still work.
  await page.goto("/attendance/eligible");
  await expect(page).toHaveURL(/\/whatsapp-groups\/ready$/);
});

test("access rows keep the controls compact, beside the name", async ({ page }) => {
  // The screenshot that reported it: the Members card next to the side column.
  await page.setViewportSize({ width: 1100, height: 900 });
  await openDashboard(page);
  await page.goto("/access");
  const select = page.getByRole("combobox", { name: "Access for Mala Member" });
  const name = page.getByRole("link", { name: "Mala Member", exact: true });
  const [selectBox, nameBox] = [await select.boundingBox(), await name.boundingBox()];
  expect(selectBox?.width).toBeLessThanOrEqual(170); // w-40, not stretched to fill the row
  // Same line as the name, on the right.
  expect(Math.abs((selectBox?.y ?? 0) + (selectBox?.height ?? 0) / 2 - ((nameBox?.y ?? 0) + 10))).toBeLessThan(30);
  expect(selectBox?.x ?? 0).toBeGreaterThan((nameBox?.x ?? 0) + 200);
  await page.screenshot({ path: "test-results/access-rows.png", fullPage: true });
});
