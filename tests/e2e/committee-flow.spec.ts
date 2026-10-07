import { expect, test } from "@playwright/test";
import { E2E_MEMBER, MEMBER_STORAGE_STATE } from "./constants";
import { confirmDialog, formatShort, isoDaysAgo, openDashboard, schedulePractice } from "./helpers";

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
  await confirmDialog(page, { title: /^Add the group/ });
  await expect(page.getByText("Group added")).toBeVisible();
  await expect(page.getByRole("link", { name: /VI Main/ })).toBeVisible();

  // Add a member by hand; a bad email is caught first.
  await page.goto("/members/new");
  await page.getByLabel("First name").fill("nethmi");
  await page.getByLabel("Last name").fill("perera");
  await page.getByLabel("IIT student ID").fill("w2026500");
  await page.getByLabel("WhatsApp number").fill("077 555 0000");
  await page.getByLabel("IIT email address").fill("nethmi@gmail.com");
  await page.getByLabel("Voice type").selectOption("ALTO");
  await page.getByLabel("Current year of study").selectOption("L4");
  await page.getByLabel("Dietary preferences (optional)").fill("Vegetarian");
  await page.getByLabel("Location (nearest landmark)").fill("Kohuwala junction");
  await page.getByLabel("Coordinates (optional)").fill("6.8664, 79.8774");
  await page.getByLabel("Member agreed to share their approximate location").check();
  await expect(page.getByLabel("Status")).toHaveValue("PROSPECTIVE");
  await expect(page.getByRole("button", { name: /send group invites/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Save member" }).click();
  await confirmDialog(page, { title: "Add Nethmi Perera?", cancel: true });
  await expect(page).toHaveURL(/\/members\/new$/); // nothing saved
  await page.getByRole("button", { name: "Save member" }).click();
  await confirmDialog(page);
  await expect(page.getByText("Must be an @iit.ac.lk address")).toBeVisible();
  await page.getByLabel("IIT email address").fill("nethmi.w2026500@iit.ac.lk");
  await page.getByRole("button", { name: "Save member" }).click();
  await confirmDialog(page);
  await expect(page.getByRole("heading", { level: 1, name: "Nethmi Perera" })).toBeVisible();
  await expect(page.getByText("0/3 practices")).toBeVisible();
  await expect(page.getByText("Vegetarian")).toBeVisible();
  await expect(page.getByText("On map", { exact: true })).toBeVisible();
  await expect(page.getByText("6.866, 79.877")).toBeVisible();
  await expect(page.getByLabel("Location (nearest landmark)")).toHaveValue("Kohuwala junction");

  // Adding the same person again is blocked with a link to the profile.
  await page.goto("/members/new");
  await page.getByLabel("First name").fill("Nethmi");
  await page.getByLabel("Last name").fill("Perera");
  await page.getByLabel("IIT student ID").fill("W2026500");
  await page.getByLabel("WhatsApp number").fill("0775550000");
  await page.getByLabel("IIT email address").fill("nethmi.w2026500@iit.ac.lk");
  await page.getByLabel("Current year of study").selectOption("L4");
  await page.getByRole("button", { name: "Save member" }).click();
  await confirmDialog(page);
  await expect(page.getByText("This person already exists")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open their profile" })).toBeVisible();

  // No practice scheduled today → no way to take attendance yet.
  await page.goto("/attendance");
  await expect(page.getByText("No practice is scheduled for today")).toBeVisible();
  await expect(page.getByRole("link", { name: "Take attendance" })).toHaveCount(0);

  // Schedule today's practice, then take attendance.
  await schedulePractice(page, { date: isoDaysAgo(0), start: "17:30", end: "19:30", venue: "IIT Auditorium" });
  await page.getByRole("link", { name: "Take attendance" }).click();
  await page.getByPlaceholder("Search by name or student ID").fill("nethmi");
  await page.getByRole("button", { name: /Nethmi Perera/ }).click();
  await expect(page.getByRole("button", { name: /Nethmi Perera/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 present")).toBeVisible();

  // Two earlier practices (an admin may record past practices).
  for (const daysAgo of [7, 14]) {
    await schedulePractice(page, { date: isoDaysAgo(daysAgo), start: "17:30" });
    await page.getByRole("link", { name: new RegExp(`^${formatShort(isoDaysAgo(daysAgo))}`) }).click();
    await page.getByPlaceholder("Search by name or student ID").fill("nethmi");
    await page.getByRole("button", { name: /Nethmi Perera/ }).click();
    await expect(page.getByRole("button", { name: /Nethmi Perera/ })).toHaveAttribute("aria-pressed", "true");
  }

  // Now on the "Ready for WhatsApp" list → send the invite by email.
  await page.goto("/attendance/eligible");
  await expect(page.getByRole("link", { name: "Nethmi Perera" })).toBeVisible();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Nethmi Perera" })
    .getByRole("link", { name: "Invite", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Send group invites" })).toBeVisible();
  await page.getByRole("radio", { name: /Email/ }).check();
  await expect(page.getByLabel("Message preview")).toHaveValue(
    /Hi Nethmi![\s\S]*VI Main — https:\/\/chat\.whatsapp\.com\/E2eMainGroupLink123/,
  );
  // Tests run in development email mode: the app must say so rather than claim it sent.
  await expect(page.getByText("Email isn't set up yet")).toBeVisible();
  await page.getByRole("button", { name: "Send email" }).click();
  await confirmDialog(page, { title: "Email Nethmi the invite?" });
  await expect(page.getByText(/Recorded 1 invite\(s\), but NO email was delivered/)).toBeVisible();

  // Mark as joined in the main group → Active.
  await page.getByRole("link", { name: "Open profile" }).click();
  await expect(page.getByText("Invited", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Joined" }).click();
  await confirmDialog(page, { title: /^Mark Nethmi as joined VI Main\?/ });
  await expect(page.getByText("Joined", { exact: true })).toBeVisible();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
});

test("a group page lists who to invite, sends bulk email invites and tracks who's in", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/whatsapp-groups");
  await page.getByRole("link", { name: /VI Main/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "VI Main" })).toBeVisible();

  // The active member who isn't in the group is at the top.
  const activeSection = page.locator("section").filter({ hasText: "Active members not in this group" });
  await expect(activeSection.getByRole("link", { name: "Mala Member" })).toBeVisible();
  await activeSection.getByRole("checkbox", { name: "Select Mala Member" }).check();
  await page.getByRole("button", { name: "Email invites (1)" }).click();
  await confirmDialog(page, { title: "Email the VI Main invite to 1 person?" });
  await expect(page.getByText(/Recorded 1 invite\(s\)/)).toBeVisible();

  // Mark them as in the group (bulk) → they move to the "In the group" tab.
  await page.getByRole("checkbox", { name: "Select Mala Member" }).check();
  await page.getByRole("button", { name: "Mark as joined" }).click();
  await confirmDialog(page);
  await expect(page.getByText("1 marked as in VI Main")).toBeVisible();
  await page.getByRole("link", { name: /In the group/ }).click();
  await expect(page.getByRole("link", { name: "Mala Member" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nethmi Perera" })).toBeVisible();

  // A Tenors-only group: other parts are greyed out with the reason.
  await page.goto("/whatsapp-groups");
  const addGroup = page.locator("form").filter({ has: page.getByRole("button", { name: "Add group" }) });
  await addGroup.getByLabel("Group name").fill("VI Tenors");
  await addGroup.getByLabel("Invite link").fill("https://chat.whatsapp.com/E2eTenorsGroupLink1");
  await addGroup.getByLabel("Only some parts (e.g. a Tenors group)").check();
  await addGroup.getByRole("button", { name: "Tenor", exact: true }).click();
  await addGroup.getByLabel("New members only after the required practices").uncheck();
  await addGroup.getByRole("button", { name: "Add group" }).click();
  await confirmDialog(page, { title: /^Add the group/ });
  await expect(page.getByText("Group added")).toBeVisible();
  await page.getByRole("link", { name: /VI Tenors/ }).click();
  await expect(page.getByText("Tenors only").first()).toBeVisible();
  const blocked = page.locator("section").filter({ hasText: "Can't join yet" });
  await expect(blocked.getByText(/For Tenors only/).first()).toBeVisible();
  await expect(blocked.getByRole("checkbox", { name: "Select Nethmi Perera" })).toBeDisabled();
  // Admin override makes them selectable.
  await page.getByLabel("Override restrictions").check();
  await expect(blocked.getByRole("checkbox", { name: "Select Nethmi Perera" })).toBeEnabled();
});

test("CSV import shows a preview before saving", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/members/import");
  await page.getByLabel("CSV file").setInputFiles("tests/fixtures/registration-form.csv");
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("3 new", { exact: true })).toBeVisible();
  await expect(page.getByText("1 invalid")).toBeVisible();
  await expect(page.getByText(/Line 5/)).toBeVisible();
  await expect(page.getByText(/All 3 new members will be added as/)).toBeVisible();
  await page.getByRole("button", { name: "Import 3 row(s)" }).click();
  await confirmDialog(page, { title: "Import 3 row(s)?" });
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.goto("/members?status=PROSPECTIVE");
  await expect(page.getByRole("link", { name: "Amaya Perera" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kavindu Silva" })).toBeVisible();

  // First-time setup: the Status column decides, and the preview shows it.
  await page.goto("/members/import");
  await page.getByLabel("CSV file").setInputFiles("tests/fixtures/registration-form-2026.csv");
  await page.getByLabel("First-time setup: use the file's Status column").check();
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("Using the Status column (first-time setup)")).toBeVisible();
  await expect(page.getByText(/1 active, 2 prospective/)).toBeVisible();
  await page.getByRole("button", { name: "Import 3 row(s)" }).click();
  await confirmDialog(page, { title: "Import 3 row(s)?" });
  await expect(page.getByText("Import complete")).toBeVisible();
  await page.goto("/members?status=ACTIVE");
  await expect(page.getByRole("link", { name: "Nimal Dias" })).toBeVisible();
});

test("a removed member can be found under Removed and restored", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/members");
  await page.getByRole("link", { name: "Amaya Perera" }).click();
  await page.getByRole("button", { name: "Remove member" }).click();
  await confirmDialog(page, { title: "Remove Amaya Perera?" });
  await expect(page.getByText("This member has been removed")).toBeVisible();

  // Gone from the normal list, but findable.
  await page.goto("/members");
  await expect(page.getByRole("link", { name: "Amaya Perera" })).toHaveCount(0);
  await page.getByRole("link", { name: /1 removed \(can be restored\)/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Removed members" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Amaya Perera" })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await confirmDialog(page, { title: "Restore Amaya Perera?" });
  await expect(page.getByRole("link", { name: "Amaya Perera" })).toHaveCount(0);

  await page.goto("/members");
  await expect(page.getByRole("link", { name: "Amaya Perera" })).toBeVisible();
});

test("the practice venue accepts coordinates pasted from Google Maps", async ({ page }) => {
  await openDashboard(page);
  await page.goto("/settings");
  const venue = page.locator("form").filter({ has: page.getByLabel("Coordinates") });

  await venue.getByLabel("Coordinates").fill("not a place");
  await venue.getByRole("button", { name: "Save" }).click();
  await confirmDialog(page);
  await expect(page.getByText(/two numbers separated by a comma/)).toBeVisible();

  await venue.getByLabel("Coordinates").fill("6.895386124694451, 79.85567372806051");
  await venue.getByRole("button", { name: "Save" }).click();
  await confirmDialog(page);
  await expect(page.getByText("Setting saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Coordinates")).toHaveValue("6.895386, 79.855674");
});

test("every section renders", async ({ page }) => {
  await openDashboard(page);
  for (const [path, heading] of [
    ["/birthdays", "Birthdays 🎂"],
    ["/carpool", "Lifts home"],
    ["/attendance/reports", "Attendance reports"],
    ["/settings", "Settings"],
    ["/settings/users", "Access & roles"], // old URL redirects to the new page
    ["/settings/system", "Settings"],
    ["/settings/email-preview", "Settings"],
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
  await confirmDialog(page, { title: "Change Nethmi Perera's access to Committee?" });
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

test("members see scheduled practices and reply; committee sees who's coming", async ({ page, browser }) => {
  // Committee schedules a practice three days from now.
  await openDashboard(page);
  const date = isoDaysAgo(-3);
  await schedulePractice(page, { date, start: "18:00", end: "20:00", venue: "Main Hall", title: "Concert rehearsal" });

  // A member signs in and sees it on their dashboard.
  const memberContext = await browser.newContext({ storageState: MEMBER_STORAGE_STATE });
  const member = await memberContext.newPage();
  await member.goto("/");
  await expect(member.getByRole("heading", { level: 1, name: `Hi ${E2E_MEMBER.firstName} 👋` })).toBeVisible();
  await expect(member.getByText("Concert rehearsal")).toBeVisible();
  await expect(member.getByText("6:00 PM – 8:00 PM")).toBeVisible();
  await expect(member.getByText("Main Hall")).toBeVisible();
  await member.getByRole("button", { name: /^Going — Concert rehearsal/ }).click();
  await expect(member.getByText("See you there!")).toBeVisible();
  await expect(member.getByRole("button", { name: /^Going — Concert rehearsal/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Members have no committee pages.
  await member.goto("/attendance");
  await expect(member).toHaveURL(/\/forbidden$/);
  await member.goto("/members");
  await expect(member).toHaveURL(/\/forbidden$/);

  // Committee sees the reply with the member's name.
  await page.goto("/attendance");
  const card = page.locator("div.rounded-lg").filter({ hasText: "Concert rehearsal" }).first();
  await expect(card.getByText("✓ 1 going")).toBeVisible();
  await expect(card.getByText("Venue not requested")).toBeVisible();
  await card.getByRole("link", { name: /^Open Concert rehearsal/ }).click();
  await expect(page.getByRole("heading", { name: "Going (1)" })).toBeVisible();

  // Admin books the venue: open the ready-made Gmail draft, mark it sent, then confirmed.
  const gmail = page.getByRole("link", { name: "Open the email in Gmail" });
  await expect(gmail).toHaveAttribute("href", /^https:\/\/mail\.google\.com\/mail\/\?view=cm/);
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await confirmDialog(page, { title: "Mark the venue request as sent?" });
  await expect(page.getByText(/✓ Marked as sent on/)).toBeVisible();
  await page.getByLabel("Venue they gave you").fill("Main Hall");
  await page.getByRole("button", { name: "Mark venue confirmed" }).click();
  await confirmDialog(page, { title: "Confirm the venue as Main Hall?" });
  await expect(page.getByText("Venue confirmed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: `${E2E_MEMBER.firstName} ${E2E_MEMBER.lastName}` }).first(),
  ).toBeVisible();
  await expect(page.getByText("Attendance opens on the practice day.")).toBeVisible();

  // Committee edits the venue → the member sees the change.
  await page.getByRole("link", { name: "Edit details" }).click();
  await page.getByLabel("Venue").fill("Studio 2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await confirmDialog(page);
  await expect(page.getByText("Studio 2").first()).toBeVisible();
  await member.goto("/");
  await expect(member.getByText("Studio 2")).toBeVisible();

  // Cancelling shows it as cancelled and closes replies.
  await page.getByRole("button", { name: "Cancel practice" }).click();
  await confirmDialog(page, { title: "Cancel this practice?" });
  await expect(page.getByRole("button", { name: "Restore practice" })).toBeVisible();
  await member.goto("/");
  await expect(member.getByText("Cancelled")).toBeVisible();
  await expect(member.getByRole("button", { name: /^Going — Concert rehearsal/ })).toBeDisabled();
  await memberContext.close();
});
