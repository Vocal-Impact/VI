import "server-only";
import { parseMailbox, type EmailMessage, type EmailSender } from "../domain/email";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Brevo transactional email API (free plan: 300 emails/day).
 * The sender address must be a verified sender in Brevo.
 * https://developers.brevo.com/reference/sendtransacemail
 */
export class BrevoEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await this.fetchImpl(BREVO_SEND_URL, {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: parseMailbox(this.from),
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { message?: string; code?: string };
        detail = [body.code, body.message].filter(Boolean).join(": ");
      } catch {
        // Non-JSON error body — the status code is enough.
      }
      throw new Error(`Brevo responded ${response.status}${detail ? ` (${detail})` : ""}`);
    }
  }
}
