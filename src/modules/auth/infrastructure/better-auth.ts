import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/shared/db/prisma";
import { getEnv } from "@/shared/config/env";
import { linkNewLoginToMember, mayCreateLogin, maySignIn } from "../application/provisioning";

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
          // Nobody self-registers: only current choir members (by IIT email)
          // get a login created on first sign-in. Approved accounts already exist.
          before: async (user) => mayCreateLogin(user.email),
          after: async (user) => linkNewLoginToMember(user.id, user.email),
        },
      },
      session: {
        create: {
          before: async (session) => maySignIn(session.userId),
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
