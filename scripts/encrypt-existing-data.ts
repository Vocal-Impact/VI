/**
 * Encrypts WhatsApp numbers, locations and dietary preferences that were saved
 * before field encryption was added, and scrubs them from old audit entries.
 * Safe to run any number of times (already-encrypted rows are skipped).
 *
 *   npm run db:encrypt
 *
 * Runs automatically on every Vercel deploy (see `vercel-build` in package.json).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { FieldCipher, parseEncryptionKey } from "../src/shared/crypto/field-encryption";
import { encryptExistingData } from "../src/shared/crypto/encrypt-existing";

async function main(): Promise<void> {
  const key = parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY ?? "");
  if (!key)
    throw new Error("DATA_ENCRYPTION_KEY is missing or not 32 bytes — generate one with: openssl rand -base64 32");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: (process.env.DIRECT_URL || process.env.DATABASE_URL) as string }),
  });
  try {
    const summary = await encryptExistingData(prisma, new FieldCipher(key));
    console.log(
      `Encrypted ${summary.members} member(s) and ${summary.locations} location(s); scrubbed ${summary.auditEntries} audit field(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
