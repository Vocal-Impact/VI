import type { EmailMessage } from "./email";
import { button, card, EMAIL_COLOURS, featureCard, paragraph, renderEmailLayout, richText } from "./layout";
import { escapeHtml } from "./email";

/** Plain-text footer shared by the text versions. */
const TEXT_SIGNATURE = "— Vocal Impact 🎶";

// ─── Birthday reminder ─────────────────────────────────────────────────

export interface BirthdayPerson {
  name: string;
  voiceType: string;
  turningAge: number | null;
  whatsappNumber: string;
}

const waMe = (phoneE164: string) => `https://wa.me/${phoneE164.replace(/\D/g, "")}`;

export function birthdayDigestEmail(
  to: string,
  recipientName: string,
  dateLabel: string,
  people: BirthdayPerson[],
  logoUrl?: string,
): EmailMessage {
  const subject =
    people.length === 1
      ? `🎂 It's ${people[0]?.name}'s birthday today`
      : `🎂 ${people.length} Vocal Impact birthdays today`;

  const text = [
    `Hi ${recipientName},`,
    "",
    `Birthdays today (${dateLabel}):`,
    ...people.map((person) => {
      const age = person.turningAge ? ` — turning ${person.turningAge}` : "";
      return `• ${person.name} (${person.voiceType})${age} — WhatsApp ${person.whatsappNumber}`;
    }),
    "",
    "Don't forget to wish them in the group! 🎶",
    "",
    TEXT_SIGNATURE,
  ].join("\n");

  const cards = people
    .map((person) =>
      card(
        `<p style="margin:0 0 4px;font-size:17px;font-weight:700;color:${EMAIL_COLOURS.ink};font-family:Arial,sans-serif">🎉 ${richText(person.name)}</p>
<p style="margin:0 0 12px;font-size:14px;color:${EMAIL_COLOURS.muted};font-family:Arial,sans-serif">${richText(person.voiceType)}${person.turningAge ? ` &middot; turning <b style="color:${EMAIL_COLOURS.violet}">${person.turningAge}</b>` : ""}</p>
${button(waMe(person.whatsappNumber), "Wish them on WhatsApp", EMAIL_COLOURS.green)}`,
      ),
    )
    .join("");

  const html = renderEmailLayout({
    title: subject,
    preheader: `${people.map((person) => person.name).join(", ")} — ${dateLabel}`,
    heading: people.length === 1 ? "🎂 A birthday today!" : `🎂 ${people.length} birthdays today!`,
    bodyHtml: `${paragraph(`Hi ${richText(recipientName)}, here's who's celebrating on <b>${richText(dateLabel)}</b>:`)}
${cards}
${paragraph("Don&#39;t forget to wish them in the group! 🎶")}`,
    logoUrl,
    footerNote:
      "You're getting this because birthday reminders are turned on for your account in the Vocal Impact app.",
  });

  return { to, subject, text, html };
}

// ─── WhatsApp group invite ─────────────────────────────────────────────

export interface InviteEmailGroup {
  name: string;
  inviteLink: string;
  description?: string | null;
  isMainGroup?: boolean;
}

export interface GroupInviteEmailInput {
  to: string;
  firstName: string;
  /** The full text message (committee's template with the group list), used for the plain-text version. */
  text: string;
  /** The template text before and after the {groupList} placeholder, for the HTML version. */
  before: string;
  after: string;
  groups: InviteEmailGroup[];
  logoUrl?: string;
}

const SMALL_CAPS = `font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${EMAIL_COLOURS.muted}`;

function inviteGroupCard(group: InviteEmailGroup): string {
  const badge = group.isMainGroup
    ? ` <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:${EMAIL_COLOURS.violetLight};font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${EMAIL_COLOURS.violet};vertical-align:middle">MAIN GROUP</span>`
    : "";
  const description = group.description
    ? `<p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:${EMAIL_COLOURS.muted}">${richText(group.description)}</p>`
    : `<p style="margin:0 0 14px;font-size:0;line-height:0">&nbsp;</p>`;
  return featureCard(`<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:18px;font-weight:800;color:${EMAIL_COLOURS.ink}">💬 ${richText(group.name)}${badge}</p>
${description}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px"><tr>
<td align="center" bgcolor="${EMAIL_COLOURS.green}" style="border-radius:12px;background:${EMAIL_COLOURS.green}">
<a href="${escapeHtml(group.inviteLink)}" target="_blank" style="display:block;padding:14px 18px;font-family:Arial,sans-serif;font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px">Join on WhatsApp &rarr;</a>
</td></tr></table>`);
}

const NEXT_STEPS = [
  ["1", "Tap a green button", "on your phone"],
  ["2", "WhatsApp opens", "— tap “Join group”"],
  ["3", "Say hi!", "We can't wait to sing with you"],
];

function nextSteps(): string {
  const cells = NEXT_STEPS.map(
    ([n, title, detail]) => `<td valign="top" width="33%" style="padding:0 6px;text-align:center">
<p style="margin:0 auto 8px;width:30px;height:30px;line-height:30px;border-radius:999px;background:${EMAIL_COLOURS.ink};font-family:Arial,sans-serif;font-size:14px;font-weight:800;color:#ffffff;text-align:center">${n}</p>
<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:${EMAIL_COLOURS.ink}">${title}</p>
<p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:12px;color:${EMAIL_COLOURS.muted}">${detail}</p></td>`,
  ).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;background:${EMAIL_COLOURS.page};border-radius:14px"><tr><td style="padding:16px 8px">
<p style="margin:0 0 12px;text-align:center;${SMALL_CAPS}">What happens next</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>
</td></tr></table>`;
}

export function groupInviteEmail(input: GroupInviteEmailInput): EmailMessage {
  const subject =
    input.groups.length === 1
      ? `🎶 ${input.firstName}, join ${input.groups[0]?.name} on WhatsApp`
      : `🎶 ${input.firstName}, your Vocal Impact WhatsApp groups`;

  const html = renderEmailLayout({
    title: subject,
    preheader: `Tap to join ${input.groups.map((group) => group.name).join(", ")} on WhatsApp.`,
    kicker: "WhatsApp invite",
    heading: `You're invited, ${input.firstName}! 🎶`,
    bodyHtml: [
      input.before.trim() ? paragraph(richText(input.before.trim())) : "",
      `<p style="margin:22px 0 12px;${SMALL_CAPS}">${input.groups.length === 1 ? "Your group" : `Your groups (${input.groups.length})`}</p>`,
      input.groups.map(inviteGroupCard).join(""),
      nextSteps(),
      input.after.trim() ? paragraph(richText(input.after.trim())) : "",
      `<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid ${EMAIL_COLOURS.border};font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:${EMAIL_COLOURS.muted}">Buttons not working? Open these links on your phone:<br>${input.groups
        .map((group) => `<b>${richText(group.name)}</b>: ${richText(group.inviteLink)}`)
        .join("<br>")}</p>`,
    ].join("\n"),
    logoUrl: input.logoUrl,
    footerNote:
      "You're getting this because the Vocal Impact committee invited you to the choir's WhatsApp groups. Please don't share these links.",
  });

  return { to: input.to, subject, text: `${input.text}\n\n${TEXT_SIGNATURE}`, html };
}

// ─── Test email ────────────────────────────────────────────────────────

export function testEmail(to: string, name: string, logoUrl?: string): EmailMessage {
  const subject = "Vocal Impact app — test email";
  const text = `Hi ${name},\n\nThis is a test email from the Vocal Impact app. If you can read this, email is working. 🎶\n\n${TEXT_SIGNATURE}`;
  const html = renderEmailLayout({
    title: subject,
    preheader: "Email from the Vocal Impact app is working",
    heading: "It works! ✅",
    bodyHtml: paragraph(
      `Hi ${richText(name)}, this is a test email from the Vocal Impact app. If you can read this, email is set up correctly. 🎶`,
    ),
    logoUrl,
    footerNote: "Sent from Settings → System & data → Send me a test email.",
  });
  return { to, subject, text, html };
}
