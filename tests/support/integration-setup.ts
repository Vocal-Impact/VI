import { afterAll, beforeEach } from "vitest";
import { TEST_ENV } from "./test-env";

Object.assign(process.env, TEST_ENV);

const { prisma } = await import("@/shared/db/prisma");

const TABLES = [
  "group_invite",
  "whatsapp_group",
  "attendance",
  "practice",
  "member_location",
  "email_log",
  "import_batch",
  "audit_log",
  "cron_run",
  "geocode_cache",
  "setting",
  "session",
  "account",
  "verification",
  "user",
  "member",
];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(", ")} CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
