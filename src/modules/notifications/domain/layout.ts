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
export function button(href: string, label: string, colour: string = EMAIL_COLOURS.violet): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr>
<td align="center" bgcolor="${colour}" style="border-radius:10px;background:${colour}">
<a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:12px 22px;${FONT}font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** A light card for one item (a group, a birthday person…). */
export function card(innerHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border:1px solid ${EMAIL_COLOURS.border};border-left:4px solid ${EMAIL_COLOURS.violet};border-radius:10px;background:#ffffff"><tr>
<td style="padding:14px 16px">${innerHtml}</td></tr></table>`;
}

export interface EmailLayoutInput {
  /** Shown in the browser tab / some clients' title. */
  title: string;
  /** Hidden preview line shown next to the subject in inbox lists. */
  preheader: string;
  /** Big heading at the top of the white card. */
  heading: string;
  /** Already-safe HTML for the body. */
  bodyHtml: string;
  /** Public URL of the white wordmark; a text wordmark is used when absent (e.g. local development). */
  logoUrl?: string;
  /** Small print at the bottom (why they got this email). */
  footerNote: string;
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  const { ink, violet, page, muted } = EMAIL_COLOURS;
  const wordmark = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" width="180" alt="Vocal Impact" style="display:block;width:180px;max-width:60%;height:auto;border:0;outline:none">`
    : `<span style="${FONT}font-size:26px;font-weight:900;font-style:italic;letter-spacing:1px;color:#ffffff">VOCAL IMPACT</span>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(input.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${page}" style="background:${page}">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td bgcolor="${ink}" style="background:${ink};border-radius:16px 16px 0 0;padding:26px 28px 22px">
      ${wordmark}
      <p style="margin:10px 0 0;${FONT}font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#c4b5fd">&#9834; &#9835; &#9834;</p>
    </td></tr>
    <tr><td bgcolor="${violet}" style="background:${violet};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
    <tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px">
      <h1 style="margin:0 0 18px;${FONT}font-size:22px;line-height:1.3;font-weight:800;color:${ink}">${escapeHtml(input.heading)}</h1>
      ${input.bodyHtml}
    </td></tr>
    <tr><td style="padding:18px 28px 0;text-align:center">
      <p style="margin:0;${FONT}font-size:12px;line-height:1.5;color:${muted}">${escapeHtml(input.footerNote)}</p>
      <p style="margin:6px 0 0;${FONT}font-size:12px;color:${muted}">Vocal Impact &middot; IIT choir</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
