/**
 * Prepares the e2e database: migrate, wipe, create an admin with a password.
 * Run by Playwright's global setup through `tsx` (the Prisma client is ESM).
 */
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../../src/generated/prisma/client";
import { FieldCipher, parseEncryptionKey } from "../../src/shared/crypto/field-encryption";
import { E2E_ADMIN, E2E_ALUMNA, E2E_DATA_ENCRYPTION_KEY, E2E_DATABASE_URL, E2E_MEMBER } from "./constants";

const cipher = new FieldCipher(parseEncryptionKey(E2E_DATA_ENCRYPTION_KEY)!);

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

    // A choir member who signs in to see practices and reply.
    const member = await prisma.member.create({
      data: {
        firstName: E2E_MEMBER.firstName,
        lastName: E2E_MEMBER.lastName,
        studentId: "E2EMEMBER1",
        yearOfStudy: "L5",
        whatsappNumberEncrypted: cipher.encrypt("+94770009999"),
        whatsappNumberHash: cipher.blindIndex("+94770009999"),
        email: E2E_MEMBER.email,
        voiceType: "SOPRANO",
        status: "ACTIVE",
      },
    });
    await prisma.user.create({
      data: {
        id: "e2e-member",
        name: `${E2E_MEMBER.firstName} ${E2E_MEMBER.lastName}`,
        email: E2E_MEMBER.email,
        role: "MEMBER",
        emailVerified: true,
        memberId: member.id,
      },
    });
    await prisma.account.create({
      data: {
        id: "e2e-member-credential",
        accountId: "e2e-member",
        providerId: "credential",
        userId: "e2e-member",
        password: await hashPassword(E2E_MEMBER.password),
      },
    });

    // An alumna with a committee login: limited to alumni practices.
    const alumna = await prisma.member.create({
      data: {
        firstName: E2E_ALUMNA.firstName,
        lastName: E2E_ALUMNA.lastName,
        studentId: "E2EALUMNA1",
        yearOfStudy: "L6",
        whatsappNumberEncrypted: cipher.encrypt("+94770008888"),
        whatsappNumberHash: cipher.blindIndex("+94770008888"),
        email: E2E_ALUMNA.email,
        voiceType: "ALTO",
        status: "ALUMNI",
      },
    });
    await prisma.user.create({
      data: {
        id: "e2e-alumna",
        name: `${E2E_ALUMNA.firstName} ${E2E_ALUMNA.lastName}`,
        email: E2E_ALUMNA.email,
        role: "COMMITTEE",
        emailVerified: true,
        memberId: alumna.id,
      },
    });
    await prisma.account.create({
      data: {
        id: "e2e-alumna-credential",
        accountId: "e2e-alumna",
        providerId: "credential",
        userId: "e2e-alumna",
        password: await hashPassword(E2E_ALUMNA.password),
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
