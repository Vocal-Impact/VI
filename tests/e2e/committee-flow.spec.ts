import { expect, test } from "@playwright/test";
import { isoDaysAgo, openDashboard } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visitors are sent to the branded sign-in page", async ({ page }) => {
    await page.goto("/members");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("img", { name: "Vocal Impact" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("wrong password is rejected", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("e2e-admin@iit.ac.lk");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in with password" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test("new member journey: add → WhatsApp group → 3 practices → invite → joined", async ({ page }) => {
  await openDashboard(page);

  // Admin sets up the WhatsApp groups.
  await page.getByRole("link", { name: "WhatsApp" }).first().click();
  const addGroup = page.locator("form").filter({ has: page.getByRole("button", { name: "Add group" }) });
  await addGroup.getByLabel("Group name").fill("VI Main");
  await addGroup.getByLabel("Invite link").fill("https://chat.whatsapp.com/E2eMainGroupLink123");
  await addGroup.getByLabel("Main group").check();
  await addGroup.getByRole("button", { name: "Add group" }).click();
  await expect(page.getByText("Group added")).toBeVisible();
  await expect(page.locator("summary").filter({ hasText: "VI Main" })).toBeVisible();

  // Add a member by hand; a bad email is caught first.
  await page.goto("/members/new");
  await page.getByLabel("First name").fill("nethmi");
  await page.getByLabel("Last name").fill("perera");
  await page.getByLabel("IIT student ID").fill("w2026500");
  await page.getByLabel("WhatsApp number").fill("077 555 0000");
  await page.getByLabel("IIT email address").fill("nethmi@gmail.com");
  await page.getByLabel("Voice type").selectOption("ALTO");
  await page.getByRole("button", { name: "Save member" }).click();
  await expect(page.getByText("Must be an @iit.ac.lk address")).toBeVisible();
  await page.getByLabel("IIT email address").fill("nethmi.w2026500@iit.ac.lk");
  await page.getByRole("button", { name: "Save member" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nethmi Perera" })).toBeVisible();
  await expect(page.getByText("0/3 practices")).toBeVisible();

  // Adding the same person again is blocked with a link to the profile.
  await page.goto("/members/new");
  await page.getByLabel("First name").fill("Nethmi");
  await page.getByLabel("Last name").fill("Perera");
  await page.getByLabel("IIT student ID").fill("W2026500");
  await page.getByLabel("WhatsApp number").fill("0775550000");
  await page.getByLabel("IIT email address").fill("nethmi.w2026500@iit.ac.lk");
  await page.getByRole("button", { name: "Save member" }).click();
  await expect(page.getByText("This person already exists")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open their profile" })).toBeVisible();

  // Three practices: today's (one tap) plus two earlier dates.
  await page.goto("/attendance");
  await page.getByRole("button", { name: "Start today's practice" }).click();
  await expect(page.getByRole("button", { name: /Nethmi Perera/ })).toBeVisible();
  await page.getByRole("button", { name: /Nethmi Perera/ }).click();
  await expect(page.getByRole("button", { name: /Nethmi Perera/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 present")).toBeVisible();

  for (const daysAgo of [7, 14]) {
    await page.goto("/attendance");
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create practice" }) });
    await form.getByLabel("Date").fill(isoDaysAgo(daysAgo));
    await form.getByRole("button", { name: "Create practice" }).click();
    await page.getByPlaceholder("Search by name or student ID").fill("nethmi");
    await page.getByRole("button", { name: /Nethmi Perera/ }).click();
    await expect(page.getByRole("button", { name: /Nethmi Perera/ })).toHaveAttribute("aria-pressed", "true");
  }

  // Now on the "Ready for WhatsApp" list → send the invite by email.
  await page.goto("/attendance/eligible");
  await expect(page.getByRole("link", { name: "Nethmi Perera" })).toBeVisible();
  await page.getByRole("link", { name: "Invite", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Send group invites" })).toBeVisible();
  await page.getByRole("radio", { name: /Email/ }).check();
  await expect(page.getByLabel("Message preview")).toHaveValue(
    /Hi Nethmi![\s\S]*VI Main — https:\/\/chat\.whatsapp\.com\/E2eMainGroupLink123/,
  );
  await page.getByRole("button", { name: "Send email" }).click();
  await expect(page.getByText("1 invite email(s) sent.")).toBeVisible();

  // Mark as joined in the main group → Active.
  await page.getByRole("link", { name: "Open profile" }).click();
  await expect(page.getByText("Invited", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Joined" }).click();
  await expect(page.getByText("Joined", { exact: true })).toBeVisible();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
});

test("CSV import shows a preview before saving", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/members/import");
  await page.getByLabel("CSV file").setInputFiles("tests/fixtures/registration-form.csv");
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("3 new")).toBeVisible();
  await expect(page.getByText("1 invalid")).toBeVisible();
  await expect(page.getByText(/Line 5/)).toBeVisible();
  await page.getByRole("button", { name: "Import 3 row(s)" }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.goto("/members?status=PROSPECTIVE");
  await expect(page.getByRole("link", { name: "Amaya Perera" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kavindu Silva" })).toBeVisible();
});

test("every section renders", async ({ page }) => {
  await openDashboard(page);
  for (const [path, heading] of [
    ["/birthdays", "Birthdays 🎂"],
    ["/carpool", "Carpool"],
    ["/attendance/reports", "Attendance reports"],
    ["/settings", "Settings"],
    ["/settings/users", "Access & roles"], // old URL redirects to the new page
    ["/settings/system", "Settings"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByText("That note isn't in the score")).toBeVisible();
});

test("an admin promotes a member to committee from Access & roles", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Access & roles" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Access & roles" })).toBeVisible();

  await page.getByLabel("Search").fill("nethmi");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByLabel("Access for Nethmi Perera").selectOption("COMMITTEE");
  await page.getByRole("button", { name: "Give access" }).click();
  await expect(page.getByText("Saved: Committee")).toBeVisible();

  // The member profile now shows their access.
  await page.getByRole("link", { name: "Nethmi Perera" }).click();
  await expect(page.getByText("App access: Committee", { exact: true })).toBeVisible();
});

test("the daily cron endpoint requires its secret", async ({ request }) => {
  expect((await request.get("/api/cron/daily")).status()).toBe(401);
  const ok = await request.get("/api/cron/daily", {
    headers: { Authorization: "Bearer e2e-cron-secret" },
  });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).ok).toBe(true);
});
