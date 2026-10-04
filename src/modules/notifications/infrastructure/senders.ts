import "server-only";
import nodemailer from "nodemailer";
import { getEnv } from "@/shared/config/env";
import { logger } from "@/shared/lib/logger";
import type { EmailMessage, EmailSender } from "../domain/email";

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
  sender =
    env.EMAIL_TRANSPORT === "smtp"
      ? new SmtpEmailSender(env.EMAIL_FROM, {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          user: env.SMTP_USER as string,
          password: env.SMTP_PASSWORD as string,
        })
      : new ConsoleEmailSender();
  return sender;
}

/** Test seam. */
export function setEmailSenderForTesting(next: EmailSender | undefined): void {
  sender = next;
}

/**
 * Public URL of the email logo, or undefined locally (mail clients cannot load
 * images from localhost).
 */
export function brandLogoUrl(): string | undefined {
  const base = getEnv().BETTER_AUTH_URL.replace(/\/$/, "");
  return base.startsWith("https://") ? `${base}/brand/logo-email.png` : undefined;
}

/** False in development mode (EMAIL_TRANSPORT=console): emails are only printed, never delivered. */
export function isEmailDeliveryEnabled(): boolean {
  return getEnv().EMAIL_TRANSPORT === "smtp";
}

/** Where emails go, for the Settings page (never includes the password). */
export function describeEmailSetup(): { mode: "console" | "smtp"; host?: string; from: string; user?: string } {
  const env = getEnv();
  return env.EMAIL_TRANSPORT === "smtp"
    ? { mode: "smtp", host: `${env.SMTP_HOST}:${env.SMTP_PORT}`, from: env.EMAIL_FROM, user: env.SMTP_USER }
    : { mode: "console", from: env.EMAIL_FROM };
}
