// Public API of the notifications module.
export {
  getEmailSender,
  setEmailSenderForTesting,
  ConsoleEmailSender,
  brandLogoUrl,
  isEmailDeliveryEnabled,
  describeEmailSetup,
  describeEmailLogo,
} from "./infrastructure/senders";
export type { EmailMessage, EmailSender } from "./domain/email";
export { escapeHtml, textToHtml } from "./domain/email";
export {
  birthdayDigestEmail,
  groupInviteEmail,
  testEmail,
  type BirthdayPerson,
  type GroupInviteEmailInput,
  type InviteEmailGroup,
} from "./domain/templates";
export { renderEmailLayout } from "./domain/layout";
