/**
 * Bootstraps (or re-enables) an admin so the first person can sign in with Google.
 *
 *   npm run db:seed-admin -- --email someone@iit.ac.lk --name "Full Name"
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm run db:seed-admin -- --email you@iit.ac.lk --name "Your Name"');
  }
  const name = values.name?.trim() || email.split("@")[0]!;

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }) });
  try {
    const user = await prisma.user.upsert({
      where: { email },
      create: { id: randomUUID(), email, name, role: "ADMIN", emailVerified: true, active: true },
      update: { role: "ADMIN", active: true, emailVerified: true },
    });
    console.log(
      `✔ ${user.email} is an admin. Sign in with Google at ${process.env.BETTER_AUTH_URL ?? "your app URL"}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
