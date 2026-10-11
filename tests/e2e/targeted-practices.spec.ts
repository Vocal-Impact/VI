import { expect, test, type Page } from "@playwright/test";
import { MEMBER_STORAGE_STATE } from "./constants";
import { confirmDialog, isoDaysAgo, openDashboard } from "./helpers";

/** Mala Member (L5) gets the given access from Access & roles. */
async function setMalaAccess(page: Page, level: "BATCH_LEAD" | "NONE", button: string, label: string) {
  await page.goto("/access?q=mala");
  const row = page.locator("form").filter({ has: page.getByLabel("Access for Mala Member") });
  await row.getByLabel("Access for Mala Member").selectOption(level);
  await row.getByRole("button", { name: button }).click();
  await confirmDialog(page, { title: `Change Mala Member's access to ${label}?` });
  await expect(page.getByText(level === "NONE" ? "Access removed" : `Saved: ${label}`)).toBeVisible();
}

test("practices for chosen members and for a level; a batch lead schedules for their own level", async ({
  page,
  browser,
}) => {
  const date = isoDaysAgo(-6);
  await openDashboard(page);
  await setMalaAccess(page, "BATCH_LEAD", "Give access", "Batch lead");

  // Admin: a practice for chosen members, picking Mala from the list.
  await page.goto("/attendance");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Schedule practice" }) });
  await form.getByRole("radio", { name: "Chosen members" }).click();
  await form.getByLabel("Search members to invite").fill("mala");
  await form.getByRole("checkbox", { name: /Mala Member/ }).check();
  await expect(form.getByText("1 chosen")).toBeVisible();
  await form.screenshot({ path: "test-results/schedule-chosen-members.png" });
  await form.getByLabel("Date").fill(date);
  await form.getByLabel("Starts").fill("17:00");
  await form.getByLabel("Title").fill("Duet rehearsal");
  await form.getByRole("button", { name: "Schedule practice" }).click();
  await confirmDialog(page, { title: /^Schedule Duet rehearsal on / });
  await expect(page.getByText("The 1 chosen member can now see it")).toBeVisible();

  // Admin: a practice for L4 only (Mala is L5).
  await form.getByRole("radio", { name: "Particular levels" }).click();
  await form.getByRole("checkbox", { name: "L4" }).check();
  await form.getByLabel("Date").fill(date);
  await form.getByLabel("Starts").fill("18:00");
  await form.getByLabel("Title").fill("L4 sectional");
  await form.getByRole("button", { name: "Schedule practice" }).click();
  await confirmDialog(page, { title: /^Schedule L4 sectional on / });
  await expect(page.getByText("Members in L4 can now see it")).toBeVisible();
  await expect(page.getByText("For L4").first()).toBeVisible();

  // Mala: sees the duet but not the L4 practice, and schedules one for L5.
  const context = await browser.newContext({ storageState: MEMBER_STORAGE_STATE });
  const mala = await context.newPage();
  await mala.goto("/");
  await expect(mala.getByText("Duet rehearsal")).toBeVisible();
  await expect(mala.getByText("1 chosen member")).toBeVisible();
  await expect(mala.getByText("L4 sectional")).toHaveCount(0);

  const leadForm = mala.locator("form").filter({ has: mala.getByRole("button", { name: "Schedule practice" }) });
  await expect(mala.getByRole("heading", { name: "Schedule a practice for L5" })).toBeVisible();
  await expect(leadForm.getByRole("radio")).toHaveCount(0); // no choice: their own level
  await mala.screenshot({ path: "test-results/batch-lead-dashboard.png", fullPage: true });
  await leadForm.getByLabel("Date").fill(date);
  await leadForm.getByLabel("Starts").fill("19:00");
  await leadForm.getByLabel("Title").fill("L5 sectional");
  await leadForm.getByRole("button", { name: "Schedule practice" }).click();
  await confirmDialog(mala, { title: /^Schedule L5 sectional on / });
  await expect(mala.getByText("Members in L5 can now see it")).toBeVisible();

  // Their own practice: they can open it, see who's coming and edit it, but not take attendance.
  await mala.getByRole("link", { name: /^Open L5 sectional/ }).click();
  await expect(mala.getByRole("heading", { level: 1, name: "L5 sectional" })).toBeVisible();
  await expect(mala.getByRole("heading", { name: /^No reply yet/ })).toBeVisible();
  await expect(mala.getByRole("link", { name: "Edit details" })).toBeVisible();
  await expect(mala.getByRole("link", { name: "← Dashboard" })).toBeVisible();
  // The Practices page is still committee-only.
  await mala.goto("/attendance");
  await expect(mala).toHaveURL(/\/forbidden/);
  await context.close();

  // Admin sees the batch lead's practice with the rest, and Mala goes back to being a member.
  await page.goto("/attendance");
  await expect(page.getByText("L5 sectional")).toBeVisible();
  await setMalaAccess(page, "NONE", "Save", "Member");
});
