/** Environment for integration tests — a separate database that gets wiped. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/vocal_impact_test";

export const TEST_ENV: Record<string, string> = {
  DATABASE_URL: TEST_DATABASE_URL,
  BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_TRANSPORT: "console",
  GEOCODER: "disabled",
  CRON_SECRET: "test-cron-secret",
  ALLOWED_EMAIL_DOMAIN: "iit.ac.lk",
};
