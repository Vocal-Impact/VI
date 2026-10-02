import { textToHtml, type EmailMessage } from "./email";

export interface BirthdayPerson {
  name: string;
  voiceType: string;
  turningAge: number | null;
  whatsappNumber: string;
}

export function birthdayDigestEmail(
  to: string,
  recipientName: string,
  dateLabel: string,
  people: BirthdayPerson[],
  logoUrl?: string,
): EmailMessage {
  const lines = people.map((person) => {
    const age = person.turningAge ? ` — turning ${person.turningAge}` : "";
    return `• ${person.name} (${person.voiceType})${age} — WhatsApp ${person.whatsappNumber}`;
  });
  const subject =
    people.length === 1
      ? `🎂 It's ${people[0]?.name}'s birthday today`
      : `🎂 ${people.length} Vocal Impact birthdays today`;
  const text = [
    `Hi ${recipientName},`,
    "",
    `Birthdays today (${dateLabel}):`,
    ...lines,
    "",
    "Don't forget to wish them in the group! 🎶",
    "",
    "— Vocal Impact app (you're receiving this because birthday reminders are on for your account)",
  ].join("\n");
  return { to, subject, text, html: textToHtml(text, logoUrl) };
}

export function groupInviteEmail(to: string, message: string, logoUrl?: string): EmailMessage {
  return {
    to,
    subject: "Your Vocal Impact WhatsApp group links 🎶",
    text: message,
    html: textToHtml(message, logoUrl),
  };
}
