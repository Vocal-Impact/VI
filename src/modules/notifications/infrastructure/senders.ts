import "server-only";
import nodemailer from "nodemailer";
import { getEnv } from "@/shared/config/env";
import { logger } from "@/shared/lib/logger";
import type { EmailMessage, EmailSender } from "../domain/email";
import { BrevoEmailSender } from "./brevo-sender";

/** Development/test transport: logs instead of sending, keeps the last messages in memory. */
export class ConsoleEmailSender implements EmailSender {
  static readonly outbox: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    ConsoleEmailSender.outbox.push(message);
    if (ConsoleEmailSender.outbox.length > 100) ConsoleEmailSender.outbox.shift();
    logger.info(`[email:console] to=${message.to} subject="${message.subject}"`);
  }
}

/** Gmail (or any) SMTP via Nodemailer. */
export class SmtpEmailSender implements EmailSender {
  private readonly transporter;

  constructor(
    private readonly from: string,
    options: { host: string; port: number; user: string; password: string },
  ) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.port === 465,
      auth: { user: options.user, pass: options.password },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

let sender: EmailSender | undefined;

/** Composition root for email: picks the adapter from EMAIL_TRANSPORT. */
export function getEmailSender(): EmailSender {
  if (sender) return sender;
  const env = getEnv();
  switch (env.EMAIL_TRANSPORT) {
    case "brevo":
      sender = new BrevoEmailSender(env.BREVO_API_KEY as string, env.EMAIL_FROM);
      break;
    case "smtp":
      sender = new SmtpEmailSender(env.EMAIL_FROM, {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER as string,
        password: env.SMTP_PASSWORD as string,
      });
      break;
    default:
      sender = new ConsoleEmailSender();
  }
  return sender;
}

/** Test seam. */
export function setEmailSenderForTesting(next: EmailSender | undefined): void {
  sender = next;
}

/**
 * Public URL of the logo used in emails. EMAIL_LOGO_URL wins (works even when
 * running locally); otherwise the deployed site's own copy. Undefined → the
 * emails show a text wordmark (mail apps can't load images from localhost).
 */
export function brandLogoUrl(): string | undefined {
  const env = getEnv();
  if (env.EMAIL_LOGO_URL) return env.EMAIL_LOGO_URL;
  const base = env.BETTER_AUTH_URL.replace(/\/$/, "");
  return base.startsWith("https://") ? `${base}/brand/logo-primary-white.png` : undefined;
}

/** Where the email logo comes from, for the Settings page. */
export function describeEmailLogo(): "custom" | "site" | "none" {
  const env = getEnv();
  if (env.EMAIL_LOGO_URL) return "custom";
  return env.BETTER_AUTH_URL.startsWith("https://") ? "site" : "none";
}

/** False in development mode (EMAIL_TRANSPORT=console): emails are only printed, never delivered. */
export function isEmailDeliveryEnabled(): boolean {
  return getEnv().EMAIL_TRANSPORT !== "console";
}

/** Where emails go, for the Settings page (never includes the password). */
export function describeEmailSetup(): { mode: "console" | "brevo" | "smtp"; via?: string; from: string } {
  const env = getEnv();
  if (env.EMAIL_TRANSPORT === "brevo") return { mode: "brevo", via: "Brevo API", from: env.EMAIL_FROM };
  if (env.EMAIL_TRANSPORT === "smtp") {
    return { mode: "smtp", via: `SMTP ${env.SMTP_HOST}:${env.SMTP_PORT} as ${env.SMTP_USER}`, from: env.EMAIL_FROM };
  }
  return { mode: "console", from: env.EMAIL_FROM };
}
