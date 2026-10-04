export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Port for sending email. Swap Gmail SMTP for Brevo etc. without touching callers. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Plain text → minimal HTML: escapes, links URLs, keeps line breaks, optional logo header. */
export function textToHtml(text: string, logoUrl?: string): string {
  const linked = escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#6d28d9">$1</a>');
  const body = linked.replaceAll("\n", "<br>");
  const logo = logoUrl
    ? `<p style="margin:0 0 20px"><img src="${escapeHtml(logoUrl)}" alt="Vocal Impact" width="160" style="display:block;border:0"></p>`
    : "";
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">` +
    `${logo}${body}<p style="margin:24px 0 0;color:#a78bfa">♪ ♫ ♪</p></div>`
  );
}

export interface Mailbox {
  name?: string;
  email: string;
}

/** Parses an address like `Vocal Impact <committee@iit.ac.lk>` (or a bare email). */
export function parseMailbox(value: string): Mailbox {
  const match = /^\s*"?([^"<]*?)"?\s*<\s*([^>\s]+)\s*>\s*$/.exec(value);
  if (match) {
    const name = match[1]?.trim();
    return name ? { name, email: match[2]! } : { email: match[2]! };
  }
  return { email: value.trim() };
}
