import { expect, test as setup } from "@playwright/test";
import { E2E_ADMIN, STORAGE_STATE } from "./constants";

// Sign in once and share the session: Better Auth rate-limits repeated sign-ins.
setup("sign in as admin", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Hi Echo/ })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
