import { z } from "zod";
import { isValidInviteLink } from "./domain/invite";

export const groupInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || null),
  inviteLink: z
    .string()
    .trim()
    .refine(isValidInviteLink, "Paste the group's invite link, e.g. https://chat.whatsapp.com/AbCdEf123…"),
  requiresEligibility: z.boolean(),
  isMainGroup: z.boolean(),
});

export type GroupInput = z.infer<typeof groupInputSchema>;

export const sendInvitesSchema = z.object({
  memberIds: z.array(z.uuid()).min(1, "Select at least one member").max(200),
  groupIds: z.array(z.uuid()).min(1, "Select at least one group"),
  channel: z.enum(["EMAIL", "WHATSAPP_LINK", "MANUAL"]),
  overrideEligibility: z.boolean().default(false),
});

export type SendInvitesInput = z.infer<typeof sendInvitesSchema>;
