import { expect, test } from "@playwright/test";
import { ALUMNA_STORAGE_STATE, MEMBER_STORAGE_STATE } from "./constants";
import { confirmDialog, isoDaysAgo, openDashboard, schedulePractice } from "./helpers";

test("alumni see choir practices read-only and organise and reply to their own practices", async ({
  page,
  browser,
}) => {
  // The committee schedules a normal choir practice.
  await openDashboard(page);
  await schedulePractice(page, { date: isoDaysAgo(-4), start: "17:00", title: "Choir run-through" });

  const alumnaContext = await browser.newContext({ storageState: ALUMNA_STORAGE_STATE });
  const alumna = await alumnaContext.newPage();
  await alumna.goto("/");
  await expect(alumna.getByRole("heading", { level: 1, name: /Hi Asha/ })).toBeVisible();

  // Very limited menu, and committee pages are off limits.
  const nav = alumna.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText([/^Dashboard/, /^Alumni practices/, /^Birthdays/]);
  await alumna.goto("/members");
  await expect(alumna).toHaveURL(/\/forbidden$/);

  // Choir practices are visible (so they can drop by) but without reply buttons.
  await alumna.goto("/");
  const choir = alumna.locator("section").filter({ has: alumna.getByRole("heading", { name: "🎼 Choir practices" }) });
  await expect(choir.getByText("Choir run-through")).toBeVisible();
  await expect(choir.getByRole("button", { name: /^Going/ })).toHaveCount(0);

  // An alumna on the committee schedules an alumni practice…
  await alumna.goto("/alumni");
  const form = alumna.locator("form").filter({ has: alumna.getByRole("button", { name: "Schedule practice" }) });
  await form.getByLabel("Date").fill(isoDaysAgo(-6));
  await form.getByLabel("Starts").fill("18:00");
  await form.getByLabel("Title").fill("Guest performance");
  await form.getByRole("button", { name: "Schedule practice" }).click();
  await confirmDialog(alumna, { title: /^Schedule Guest performance on / });
  await expect(alumna.getByText("Practice scheduled").first()).toBeVisible();

  // …and replies to it from the dashboard.
  await alumna.goto("/");
  await alumna.getByRole("button", { name: /^Going — Guest performance/ }).click();
  await expect(alumna.getByText("See you there!")).toBeVisible();
  await alumnaContext.close();

  // Current members never see alumni practices.
  const memberContext = await browser.newContext({ storageState: MEMBER_STORAGE_STATE });
  const member = await memberContext.newPage();
  await member.goto("/");
  await expect(member.getByText("Choir run-through")).toBeVisible();
  await expect(member.getByText("Guest performance")).toHaveCount(0);
  await memberContext.close();

  // Nor do the committee's choir practice lists.
  await page.goto("/attendance");
  await expect(page.getByText("Guest performance")).toHaveCount(0);
  await page.goto("/alumni");
  await expect(page.getByText("Guest performance")).toBeVisible();
});

test("member search filters as you type", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/members");
  await page.waitForLoadState("networkidle"); // like a person: start typing once the page has loaded
  await page.getByLabel("Search").pressSequentially("mala", { delay: 40 });
  await expect(page).toHaveURL(/[?&]q=mala/);
  await expect(page.getByRole("link", { name: "Mala Member" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Asha Alumna" })).toHaveCount(0);
  await page.getByLabel("Status").selectOption("ALUMNI");
  await expect(page).toHaveURL(/status=ALUMNI/);
  await expect(page.getByText("No members found")).toBeVisible();
});

test("changing a member's status shows straight away", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/members?q=alumna");
  await page.getByRole("link", { name: "Asha Alumna" }).click();
  const status = page.getByLabel("Status", { exact: true });
  await expect(status).toHaveValue("ALUMNI");
  await status.selectOption("ACTIVE");
  await page.getByRole("button", { name: "Update" }).click();
  await confirmDialog(page);
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
  await expect(status).toHaveValue("ACTIVE"); // no snapping back to the old status
  // Put it back for other tests.
  await status.selectOption("ALUMNI");
  await page.getByRole("button", { name: "Update" }).click();
  await confirmDialog(page);
  await expect(status).toHaveValue("ALUMNI");
});
