import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/shared/db/prisma";
import { getEnv } from "@/shared/config/env";
import { logger } from "@/shared/lib/logger";

const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7;
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

function createAuth() {
  const env = getEnv();
  const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    socialProviders: googleConfigured
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID as string,
            clientSecret: env.GOOGLE_CLIENT_SECRET as string,
            prompt: "select_account",
          },
        }
      : undefined,
    // Local development / automated tests only (guarded in env.ts).
    emailAndPassword: { enabled: env.ENABLE_PASSWORD_LOGIN, disableSignUp: true },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    session: {
      expiresIn: SEVEN_DAYS_IN_SECONDS,
      updateAge: ONE_DAY_IN_SECONDS,
    },
    databaseHooks: {
      user: {
        create: {
          // Allowlist: nobody can self-register. Admins pre-create users
          // (Settings → Users), and Google sign-in links to that row.
          before: async (user) => {
            logger.warn("Blocked sign-in from non-allowlisted email", { email: user.email });
            return false;
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { active: true } });
            return user?.active === true;
          },
        },
      },
    },
    onAPIError: { errorURL: "/sign-in" },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** Lazily created so builds do not require auth secrets. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

export function isGoogleSignInConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function isPasswordSignInEnabled(): boolean {
  return getEnv().ENABLE_PASSWORD_LOGIN;
}
