import "server-only";
import { z } from "zod";
import { parseEncryptionKey } from "@/shared/crypto/field-encryption";

const booleanFromString = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((value) => value === "true" || value === "1");

const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    ENABLE_PASSWORD_LOGIN: booleanFromString,
    /**
     * Encrypts phone numbers, locations and dietary preferences in the database.
     * 32 random bytes as base64: `openssl rand -base64 32`. Losing it makes that data unreadable.
     */
    DATA_ENCRYPTION_KEY: z
      .string({ error: "DATA_ENCRYPTION_KEY is required — generate one with: openssl rand -base64 32" })
      .refine(
        (value) => parseEncryptionKey(value) !== null,
        "DATA_ENCRYPTION_KEY must be 32 bytes as base64 (openssl rand -base64 32)",
      ),

    EMAIL_TRANSPORT: z.enum(["console", "brevo", "smtp"]).default("console"),
    BREVO_API_KEY: z.string().optional(),
    /** Public https URL of the white logo for emails (e.g. uploaded to Brevo's image library). */
    EMAIL_LOGO_URL: z
      .url()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    SMTP_HOST: z.string().default("smtp.gmail.com"),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().default("Vocal Impact <noreply@example.com>"),

    CRON_SECRET: z.string().min(1).optional(),

    GEOCODER: z.enum(["nominatim", "disabled"]).default("nominatim"),
    NOMINATIM_USER_AGENT: z.string().default("VocalImpactApp/1.0"),
    ORS_API_KEY: z.string().optional(),
    /** Optional Google Maps Geocoding API key — tried first for landmarks when set (needs a billing account). */
    GOOGLE_MAPS_API_KEY: z.string().optional(),

    ALLOWED_EMAIL_DOMAIN: z.string().default("iit.ac.lk"),
    VERCEL_ENV: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.ENABLE_PASSWORD_LOGIN && env.VERCEL_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["ENABLE_PASSWORD_LOGIN"],
        message: "Password login is for local development and tests only — never enable it in production.",
      });
    }
    if (env.EMAIL_TRANSPORT === "brevo" && !env.BREVO_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["BREVO_API_KEY"],
        message: "BREVO_API_KEY is required when EMAIL_TRANSPORT=brevo (Brevo → SMTP & API → API keys).",
      });
    }
    if (env.EMAIL_TRANSPORT === "smtp" && (!env.SMTP_USER || !env.SMTP_PASSWORD)) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_USER"],
        message: "SMTP_USER and SMTP_PASSWORD are required when EMAIL_TRANSPORT=smtp.",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated server environment. Parsed lazily so `next build` does not need
 * runtime secrets, but fails fast with a clear message on first use.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  cached = result.data;
  return cached;
}
