// Public API of the notifications module.
export { getEmailSender, setEmailSenderForTesting, ConsoleEmailSender, brandLogoUrl } from "./infrastructure/senders";
export type { EmailMessage, EmailSender } from "./domain/email";
export { escapeHtml, textToHtml } from "./domain/email";
export { birthdayDigestEmail, groupInviteEmail, type BirthdayPerson } from "./domain/templates";
