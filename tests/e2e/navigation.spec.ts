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
