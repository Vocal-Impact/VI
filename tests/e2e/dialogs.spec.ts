import { expect, test, type Locator } from "@playwright/test";
import { confirmDialog, isoDaysAgo, openDashboard, openFormDialog } from "./helpers";

/**
 * The add / edit forms open over the page. Runs in Chrome and in Safari's engine
 * (Mac and iPhone), which sized the dialog's scrolling body differently and once
 * collapsed it to nothing.
 */

/** The dialog shows its form: the body has real height and the save button can be reached. */
async function expectUsable(dialog: Locator, saveButton: string) {
  await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const body = await dialog.evaluate((element) => {
    const content = element.lastElementChild as HTMLElement;
    return { height: content.clientHeight, dialogHeight: element.clientHeight, viewport: window.innerHeight };
  });
  expect(body.height).toBeGreaterThan(150);
  expect(body.dialogHeight).toBeLessThanOrEqual(body.viewport);
  // On phones every field has at least 16px text, or iPhone Safari zooms in when it's tapped.
  const smallestText = await dialog.evaluate((element) =>
    window.innerWidth >= 640
      ? 16
      : Math.min(
          ...Array.from(element.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select, textarea")).map(
            (field) => parseFloat(getComputedStyle(field).fontSize),
          ),
        ),
  );
  expect(smallestText).toBeGreaterThanOrEqual(16);
  const save = dialog.getByRole("button", { name: saveButton });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
}

test("add and edit forms open fully, in every browser", async ({ page }, testInfo) => {
  const tag = testInfo.project.name;
  await openDashboard(page);

  // Add a member.
  await page.goto("/members");
  let dialog = await openFormDialog(page, "Add member");
  await expectUsable(dialog, "Save member");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Add a group, then edit it.
  await page.goto("/whatsapp-groups");
  dialog = await openFormDialog(page, "Add group");
  await expectUsable(dialog, "Add group");
  await dialog.getByLabel("Group name").fill(`Dialog check ${tag}`);
  await dialog.getByLabel("Invite link").fill(`https://chat.whatsapp.com/DialogCheck${tag.replace(/\W/g, "")}1234`);
  await dialog.getByRole("button", { name: "Add group" }).click();
  await confirmDialog(page);
  await expect(dialog).toBeHidden();
  await page.getByRole("link", { name: new RegExp(`Dialog check ${tag}`) }).click();
  dialog = await openFormDialog(page, "Edit group");
  await expectUsable(dialog, "Save group");
  await page.keyboard.press("Escape");

  // Schedule a practice, then edit it.
  await page.goto("/attendance");
  dialog = await openFormDialog(page, "Schedule practice");
  await expectUsable(dialog, "Schedule practice");
  await dialog.getByLabel("Date").fill(isoDaysAgo(-40));
  await dialog.getByLabel("Starts").fill("18:00");
  await dialog.getByLabel("Title").fill(`Dialog check ${tag}`);
  await dialog.getByRole("button", { name: "Schedule practice" }).click();
  await confirmDialog(page);
  await expect(dialog).toBeHidden();
  await page.goto("/attendance");
  await page.getByRole("link", { name: new RegExp(`^Open Dialog check ${tag}`) }).click();
  dialog = await openFormDialog(page, "Edit details");
  await expectUsable(dialog, "Save changes");
  await page.keyboard.press("Escape");

  // Edit a member.
  await page.goto("/members?q=mala");
  await page.getByRole("link", { name: "Mala Member" }).click();
  dialog = await openFormDialog(page, "Edit");
  await expectUsable(dialog, "Save changes");
  await page.screenshot({ path: `test-results/edit-member-${tag}.png` });
});
