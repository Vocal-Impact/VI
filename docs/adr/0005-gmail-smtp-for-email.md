# 5. Email over SMTP (Gmail App Password, Brevo fallback)

- **Status:** Accepted (2026-10-02)

## Decision

- **Transport:** Nodemailer over SMTP, behind the `EmailSender` port.
- **Default provider:** a committee IIT Google account with an App Password.
- **Fallback:** if IIT disables App Passwords, switch to Brevo's free SMTP. Only environment variables change.
- **Development and tests:** the console transport, which also keeps an in-memory outbox.

## Consequences

- **Volume:** a few emails a day, far below any free limit.
- **Idempotency:** `email_log` has a unique key per (type, member, date, recipient), so cron retries never send duplicates.
