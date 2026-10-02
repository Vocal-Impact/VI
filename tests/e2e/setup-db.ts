/**
 * Prepares the e2e database: migrate, wipe, create an admin with a password.
 * Run by Playwright's global setup through `tsx` (the Prisma client is ESM).
 */
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../../src/generated/prisma/client";
import { E2E_ADMIN, E2E_DATABASE_URL } from "./constants";

async function main(): Promise<void> {
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
      DIRECT_URL: E2E_DATABASE_URL,
    },
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: E2E_DATABASE_URL }),
  });
  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);

    await prisma.user.create({
      data: {
        id: "e2e-admin",
        name: E2E_ADMIN.name,
        email: E2E_ADMIN.email,
        role: "ADMIN",
        emailVerified: true,
      },
    });
    await prisma.account.create({
      data: {
        id: "e2e-admin-credential",
        accountId: "e2e-admin",
        providerId: "credential",
        userId: "e2e-admin",
        password: await hashPassword(E2E_ADMIN.password),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
