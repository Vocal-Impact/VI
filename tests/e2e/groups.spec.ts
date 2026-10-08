import { expect, test } from "@playwright/test";
import { confirmDialog, openDashboard } from "./helpers";

test("groups are reordered by dragging and archived from the edit form", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/whatsapp-groups");
  const addGroup = page.locator("form").filter({ has: page.getByRole("button", { name: "Add group" }) });
  for (const name of ["Order One", "Order Two"]) {
    await addGroup.getByLabel("Group name").fill(name);
    await addGroup.getByLabel("Invite link").fill(`https://chat.whatsapp.com/${name.replace(" ", "")}Link12345`);
    await addGroup.getByRole("button", { name: "Add group" }).click();
    await confirmDialog(page);
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  }

  const names = () => page.locator("a[href^='/whatsapp-groups/'] .font-semibold").allTextContents();
  const before = await names();
  expect(before.indexOf("Order Two")).toBe(before.indexOf("Order One") + 1);

  // Keyboard drag (same as dragging with the mouse): pick up, move up one, drop.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Reorder Order Two" }).focus();
  for (const key of ["Space", "ArrowUp", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250); // the drag library measures positions between steps
  }
  await expect
    .poll(names)
    .toEqual(before.map((name) => (name === "Order One" ? "Order Two" : name === "Order Two" ? "Order One" : name)));
  await page.waitForLoadState("networkidle");
  await page.reload();
  const after = await names();
  expect(after.indexOf("Order Two")).toBe(after.indexOf("Order One") - 1); // saved

  // Mouse drag: pull "Order Two" back below "Order One".
  await page.waitForLoadState("networkidle");
  const handle = await page.getByRole("button", { name: "Reorder Order Two" }).boundingBox();
  const target = await page.getByRole("button", { name: "Reorder Order One" }).boundingBox();
  if (!handle || !target) throw new Error("drag handles not found");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, target.y + target.height / 2 + 30, { steps: 12 });
  await page.mouse.up();
  await expect.poll(names).toEqual(before);

  // Archive from the icon in the edit form's corner, then restore.
  const href = await page.getByRole("link", { name: /^Order One/ }).getAttribute("href");
  await page.goto(`${href}/edit`);
  await page.getByRole("button", { name: "Archive Order One" }).click();
  await confirmDialog(page, { title: "Archive “Order One”?" });
  await expect(page.getByRole("button", { name: "Restore Order One" })).toBeVisible();
  await page.getByRole("button", { name: "Restore Order One" }).click();
  await confirmDialog(page, { title: "Restore “Order One”?" });
  await expect(page.getByRole("button", { name: "Archive Order One" })).toBeVisible();
  await expect(page.getByText("Order & archive")).toHaveCount(0);
});
