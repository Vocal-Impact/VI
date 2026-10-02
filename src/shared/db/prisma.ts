import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Prisma client singleton. Reused across hot reloads in development so we do
 * not exhaust database connections. Created on first use so builds do not
 * need a database URL.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    globalForPrisma.prisma ??= createPrismaClient();
    const value = Reflect.get(globalForPrisma.prisma, property);
    return typeof value === "function" ? value.bind(globalForPrisma.prisma) : value;
  },
});

export type { Prisma };

/** Either the root client or an interactive-transaction client. */
export type DbClient = PrismaClient | Prisma.TransactionClient;
