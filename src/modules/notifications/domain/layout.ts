import { escapeHtml } from "./email";

/**
 * Branded HTML email layout (sent to Brevo as `htmlContent`).
 *
 * Email clients (Gmail, Outlook, phone apps) ignore <style> blocks and modern
 * CSS, so everything is tables + inline styles, max 560 px wide, with the
 * app's look: ink header, white Vocal Impact wordmark, violet accents.
 */

export const EMAIL_COLOURS = {
  ink: "#111111",
  violet: "#6d28d9",
  violetLight: "#ede9fe",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  page: "#f4f2fb",
  green: "#16a34a",
} as const;

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

/** Escapes text and turns line breaks into <br> and URLs into links. */
export function richText(text: string): string {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="color:${EMAIL_COLOURS.violet};word-break:break-all">$1</a>`)
    .replaceAll("\n", "<br>");
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;${FONT}font-size:15px;line-height:1.6;color:${EMAIL_COLOURS.text}">${html}</p>`;
}

/** A "bulletproof" button: a table cell with a background colour works in every client. */
export function button(
  href: string,
  label: string,
  colour: string = EMAIL_COLOURS.violet,
  options: { center?: boolean } = {},
): string {
  const align = options.center ? ' align="center"' : "";
  const margin = options.center ? "margin:8px auto 16px" : "margin:0 0 12px";
  return `<table role="presentation"${align} cellpadding="0" cellspacing="0" border="0" style="${margin}"><tr>
<td align="center" bgcolor="${colour}" style="border-radius:10px;background:${colour}">
<a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:12px 22px;${FONT}font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** A light card for one item (a group, a birthday person…). */
export function card(innerHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border:1px solid ${EMAIL_COLOURS.border};border-left:4px solid ${EMAIL_COLOURS.violet};border-radius:10px;background:#ffffff"><tr>
<td style="padding:14px 16px">${innerHtml}</td></tr></table>`;
}

/** A light card with a violet edge for one item (a group, a birthday person…). */
export function featureCard(innerHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;border:1px solid ${EMAIL_COLOURS.border};border-radius:14px;background:#ffffff"><tr>
<td width="6" bgcolor="${EMAIL_COLOURS.violet}" style="background:${EMAIL_COLOURS.violet};border-radius:14px 0 0 14px;font-size:0;line-height:0">&nbsp;</td>
<td style="padding:18px 18px 8px">${innerHtml}</td></tr></table>`;
}

/** Five thin lines like a music staff, with notes — the app's motif, built from table rows (email-safe). */
function staffLines(): string {
  const line = `<tr><td style="height:1px;line-height:1px;font-size:0;background:#3b3546">&nbsp;</td></tr><tr><td style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>`;
  return `<table role="presentation" width="220" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0">
<tr><td style="text-align:center;${FONT}font-size:15px;line-height:1;color:#a78bfa;padding-bottom:6px">&#9834;&nbsp;&nbsp;&#9835;&nbsp;&nbsp;&#9833;&nbsp;&nbsp;&#9836;&nbsp;&nbsp;&#9834;</td></tr>
${line.repeat(5)}
</table>`;
}

export interface EmailLayoutInput {
  /** Shown in the browser tab / some clients' title. */
  title: string;
  /** Hidden preview line shown next to the subject in inbox lists. */
  preheader: string;
  /** Small label above the heading, e.g. "WhatsApp invite". */
  kicker?: string;
  /** Big heading at the top of the white card. */
  heading: string;
  /** Already-safe HTML for the body. */
  bodyHtml: string;
  /** Public URL of the white wordmark; a text wordmark is used when absent. */
  logoUrl?: string;
  /** Small print at the bottom (why they got this email). */
  footerNote: string;
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  const { ink, violet, violetLight, page, muted } = EMAIL_COLOURS;
  const wordmark = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" width="220" alt="Vocal Impact" style="display:block;margin:0 auto;width:220px;max-width:70%;height:auto;border:0;outline:none">`
    : `<span style="${FONT}font-size:30px;font-weight:900;font-style:italic;letter-spacing:1px;color:#ffffff">VOCAL IMPACT</span>`;
  const kicker = input.kicker
    ? `<p style="margin:0 0 10px"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${violetLight};${FONT}font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${violet}">${escapeHtml(input.kicker)}</span></p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(input.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${page}" style="background:${page}">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td align="center" bgcolor="${ink}" style="background:${ink};border-radius:20px 20px 0 0;padding:34px 28px 26px;text-align:center">
      ${wordmark}
      ${staffLines()}
    </td></tr>
    <tr><td bgcolor="${violet}" style="background:${violet};height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>
    <tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:0 0 20px 20px;padding:32px 30px 26px">
      ${kicker}
      <h1 style="margin:0 0 18px;${FONT}font-size:26px;line-height:1.25;font-weight:900;letter-spacing:-0.3px;color:${ink}">${escapeHtml(input.heading)}</h1>
      ${input.bodyHtml}
    </td></tr>
    <tr><td style="padding:22px 28px 0;text-align:center">
      <p style="margin:0 0 6px;${FONT}font-size:13px;font-weight:800;font-style:italic;letter-spacing:0.5px;color:${ink}">VOCAL IMPACT</p>
      <p style="margin:0 0 10px;${FONT}font-size:12px;color:${muted}">The IIT choir &middot; &#9834; sing it loud &#9834;</p>
      <p style="margin:0;${FONT}font-size:11px;line-height:1.5;color:#9ca3af">${escapeHtml(input.footerNote)}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
