import "server-only";
import { parseMailbox, type EmailMessage, type EmailSender } from "../domain/email";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

/** Catches common copy-paste mistakes before calling Brevo. Returns a plain-English problem, or null. */
export function brevoKeyProblem(key: string): string | null {
  const value = key.trim();
  if (value.startsWith("http")) {
    return "BREVO_API_KEY contains a web address, not a key. Copy the key itself (it starts with xkeysib-) from Brevo → SMTP & API → API Keys.";
  }
  if (value.startsWith("xsmtpsib-")) {
    return "BREVO_API_KEY is an SMTP key (xsmtpsib-…). Use an API key instead (xkeysib-…) from Brevo → SMTP & API → API Keys.";
  }
  if (!value.startsWith("xkeysib-")) {
    return "BREVO_API_KEY doesn't look like a Brevo API key. It should start with xkeysib- (Brevo → SMTP & API → API Keys).";
  }
  return null;
}

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
    const problem = brevoKeyProblem(this.apiKey);
    if (problem) throw new Error(problem);
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
