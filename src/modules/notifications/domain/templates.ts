import type { EmailMessage } from "./email";
import { button, card, EMAIL_COLOURS, paragraph, renderEmailLayout, richText } from "./layout";

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

export function groupInviteEmail(input: GroupInviteEmailInput): EmailMessage {
  const subject = "Your Vocal Impact WhatsApp group links 🎶";
  const groupButtons = input.groups.map((group) => button(group.inviteLink, `Join ${group.name}`)).join("");

  const html = renderEmailLayout({
    title: subject,
    preheader: `Join ${input.groups.map((group) => group.name).join(", ")} on WhatsApp`,
    heading: `You're invited, ${input.firstName}! 🎶`,
    bodyHtml: [
      input.before.trim() ? paragraph(richText(input.before.trim())) : "",
      `<p style="margin:8px 0 12px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${EMAIL_COLOURS.muted}">Your WhatsApp groups</p>`,
      groupButtons,
      input.after.trim() ? paragraph(richText(input.after.trim())) : "",
      `<p style="margin:16px 0 0;font-family:Arial,sans-serif;font-size:12px;color:${EMAIL_COLOURS.muted}">Buttons not working? Open these links on your phone:<br>${input.groups
        .map((group) => `${richText(group.name)}: ${richText(group.inviteLink)}`)
        .join("<br>")}</p>`,
    ].join("\n"),
    logoUrl: input.logoUrl,
    footerNote: "You're getting this because the Vocal Impact committee invited you to the choir's WhatsApp groups.",
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
