import { expect, type Page } from "@playwright/test";

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
