/**
 * Deletes ALL data from the LOCAL database (members, attendance, groups,
 * invites, users, logs…) and leaves one local admin login so you can still
 * sign in while Google sign-in is not configured.
 *
 *   npm run db:wipe
 *
 * Refuses to run against anything other than localhost.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const LOCAL_ADMIN = { email: "admin@example.com", password: "vocal-impact-dev", name: "Local Admin" };

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing to wipe a non-local database (${host || "no DATABASE_URL"}).`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);

    await prisma.user.create({
      data: { id: "local-admin", name: LOCAL_ADMIN.name, email: LOCAL_ADMIN.email, role: "ADMIN", emailVerified: true },
    });
    await prisma.account.create({
      data: {
        id: "local-admin-credential",
        accountId: "local-admin",
        providerId: "credential",
        userId: "local-admin",
        password: await hashPassword(LOCAL_ADMIN.password),
      },
    });

    console.log(`Wiped ${tables.length} tables. All members, practices, groups and logs are gone.`);
    console.log(
      `Local sign-in kept: ${LOCAL_ADMIN.email} / ${LOCAL_ADMIN.password} (needs ENABLE_PASSWORD_LOGIN=true).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
