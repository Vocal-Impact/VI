import { defineConfig, devices } from "@playwright/test";
import {
  E2E_BASE_URL,
  E2E_DATA_ENCRYPTION_KEY,
  E2E_DATABASE_URL,
  E2E_PORT,
  STORAGE_STATE,
} from "./tests/e2e/constants";

/**
 * End-to-end tests against a production build (`npm run build` first).
 * Uses the test database and password sign-in (never enabled in production).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npx next start -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      BETTER_AUTH_URL: E2E_BASE_URL,
      BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789",
      ENABLE_PASSWORD_LOGIN: "true",
      EMAIL_TRANSPORT: "console",
      GEOCODER: "disabled",
      CRON_SECRET: "e2e-cron-secret",
      DATA_ENCRYPTION_KEY: E2E_DATA_ENCRYPTION_KEY,
      // Tests cover every feature, whatever a developer's .env switches off.
      FEATURE_LIFTS_HOME: "true",
      ALLOWED_EMAIL_DOMAIN: "iit.ac.lk",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
  },
});
