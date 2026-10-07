import { expect, type Page } from "@playwright/test";

/**
 * Answers the app's confirmation dialog (shown before creates, updates and
 * deletes). Clicks the confirm button, or `cancel` to back out.
 */
export async function confirmDialog(
  page: Page,
  options: { title?: string | RegExp; cancel?: boolean } = {},
): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (options.title) await expect(dialog.getByRole("heading", { name: options.title })).toBeVisible();
  await dialog
    .getByRole("button")
    .nth(options.cancel ? 0 : 1)
    .click();
  await expect(dialog).toBeHidden();
}

/** Opens the dashboard with the shared admin session (see auth.setup.ts). */
export async function openDashboard(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Hi Echo/ })).toBeVisible();
}

/** ISO date `days` ago in Sri Lanka time. */
export function isoDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(date);
}

/** Same format as the app's past-practice list, e.g. "Sun, 27 Sep 2026". */
export function formatShort(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Schedules a practice through the form on the Practices page. */
export async function schedulePractice(
  page: Page,
  practice: { date: string; start: string; end?: string; venue?: string; title?: string },
): Promise<void> {
  await page.goto("/attendance");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Schedule practice" }) });
  await form.getByLabel("Date").fill(practice.date);
  await form.getByLabel("Starts").fill(practice.start);
  if (practice.end) await form.getByLabel("Ends (optional)").fill(practice.end);
  if (practice.title) await form.getByLabel("Title").fill(practice.title);
  if (practice.venue) await form.getByLabel("Venue").fill(practice.venue);
  await form.getByRole("button", { name: "Schedule practice" }).click();
  await confirmDialog(page, { title: /^Schedule .* on / });
  await expect(page.getByText("Practice scheduled").first()).toBeVisible();
}
