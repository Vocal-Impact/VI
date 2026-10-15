import { expect, test } from "@playwright/test";
import { confirmDialog, isoDaysAgo, openDashboard, schedulePractice } from "./helpers";

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

test("upcoming practices show four and scroll the rest inside the card", async ({ page }) => {
  await openDashboard(page);
  const list = () => page.getByRole("region", { name: "Upcoming practices" });
  // Make sure there are at least five upcoming practices.
  for (let day = 20; (await list().count()) === 0 && day < 26; day++) {
    await schedulePractice(page, { date: isoDaysAgo(-day), start: "18:00", title: `Extra practice ${day}` });
    await page.goto("/");
  }
  const region = list();
  await expect(region).toBeVisible();
  const { clientHeight, scrollHeight, fourthBottom, fifthTop, top } = await region.evaluate((element) => {
    const items = Array.from(element.children) as HTMLElement[];
    const box = element.getBoundingClientRect();
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      top: box.top,
      fourthBottom: items[3]!.getBoundingClientRect().bottom,
      fifthTop: items[4]!.getBoundingClientRect().top,
    };
  });
  expect(scrollHeight).toBeGreaterThan(clientHeight); // the rest scrolls
  expect(fourthBottom).toBeLessThanOrEqual(top + clientHeight + 1); // four fully shown
  expect(fifthTop).toBeGreaterThanOrEqual(top + clientHeight - 1); // the fifth starts below the fold
  await page.screenshot({ path: "test-results/dashboard-capped.png", fullPage: true });

  // Scrolling past the end of the list carries on scrolling the page ("contain" would trap it).
  expect(await region.evaluate((element) => getComputedStyle(element).overscrollBehaviorY)).toBe("auto");
  await region.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await region.hover();
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
});

test("access changes show straight away, without a refresh", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/access?q=mala");
  const row = page.locator("form").filter({ has: page.getByLabel("Access for Mala Member") });
  const select = row.getByLabel("Access for Mala Member");

  await select.selectOption("BATCH_LEAD");
  await row.getByRole("button", { name: "Give access" }).click();
  await confirmDialog(page);
  await expect(page.getByText("Saved: Batch lead")).toBeVisible();
  await expect(select).toHaveValue("BATCH_LEAD");
  await expect(row.getByText("Batch lead", { exact: true }).first()).toBeVisible(); // the badge
  await expect(page.getByRole("link", { name: /Batch leads/ })).toContainText("1"); // the count

  // Saving again without changes keeps showing the same access.
  // Mark the dropdown: once saved, the row's controls are rebuilt, so a fresh one replaces it.
  await select.evaluate((element) => element.setAttribute("data-before-save", ""));
  await row.getByRole("button", { name: "Save" }).click();
  await confirmDialog(page);
  await expect(row.locator("select[data-before-save]")).toHaveCount(0);
  await expect(select).toHaveValue("BATCH_LEAD");

  // And back to Member.
  await select.selectOption("NONE");
  await row.getByRole("button", { name: "Save" }).click();
  await confirmDialog(page);
  await expect(page.getByText("Access removed")).toBeVisible();
  await expect(select).toHaveValue("NONE");
  await expect(row.getByRole("button", { name: "Save" })).toBeVisible();
});

test("replies and the attendance list can be narrowed to one voice part", async ({ page }) => {
  await openDashboard(page);
  // A practice nobody has replied to: Mala (a soprano) is in "No reply yet".
  await schedulePractice(page, { date: isoDaysAgo(-30), start: "18:00", title: "Section check" });
  await page.goto("/attendance");
  await page.getByRole("link", { name: /^Open Section check/ }).click();
  const replies = page.getByRole("region", { name: "Replies" });
  const noReply = replies.locator("section").filter({ hasText: "No reply yet" });
  await expect(noReply.getByRole("link", { name: "Mala Member" })).toBeVisible();
  await replies.getByLabel("Voice part").selectOption("TENOR");
  await expect(noReply.getByRole("link", { name: "Mala Member" })).toHaveCount(0);
  await replies.getByLabel("Voice part").selectOption("SOPRANO");
  await expect(noReply.getByRole("link", { name: "Mala Member" })).toBeVisible();

  // Today's practice: the attendance list filters the same way.
  await page.goto("/attendance");
  await page.getByRole("link", { name: "Take attendance" }).click();
  const list = page.getByRole("list", { name: "Members" });
  await expect(list.getByText("Mala Member")).toBeVisible();
  await page.getByRole("combobox", { name: "Voice part" }).last().selectOption("TENOR");
  await expect(list.getByText("Mala Member")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Voice part" }).last().selectOption("ALL");
  await expect(list.getByText("Mala Member")).toBeVisible();
});

test("the members list says how many there are and pages them", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/members");
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText(/Showing 1–\d+ of \d+ members/);
});
