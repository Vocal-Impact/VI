import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Read directly (not via `env()`) so `prisma generate` works in CI/Vercel
    // builds where no database URL is needed. Migrations prefer the direct
    // (non-pooled) Neon connection when one is configured.
    // `||`, not `??`: an empty DIRECT_URL (e.g. an unset Vercel variable) means "not set".
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
