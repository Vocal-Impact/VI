import { z } from "zod";

/**
 * Admin-editable settings. Each has a schema and a default; values are stored
 * as JSON in the `setting` table and validated on every read.
 */
export const DEFAULT_INVITE_TEMPLATE = [
  "Hi {firstName}! 🎶 Welcome to Vocal Impact.",
  "Here are the WhatsApp groups to join:",
  "{groupList}",
  "See you at the next practice!",
].join("\n");

export const venueSchema = z.object({
  name: z.string().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type Venue = z.infer<typeof venueSchema>;

export const DEFAULT_VENUE_REQUEST_BODY = [
  "Dear Sir/Madam,",
  "",
  "I am writing on behalf of Vocal Impact, the IIT choir, to request a venue for our practice session.",
  "",
  "Date: {date}",
  "Time: {time}",
  "Preferred venue: {venue}",
  "Expected attendance: about {expected} members",
  "",
  "We would be grateful if you could let us know which venue is available.",
  "",
  "Thank you,",
  "{senderName}",
  "Vocal Impact Committee",
].join("\n");

const emailList = z.array(z.email("Not a valid email address")).max(10, "At most 10 addresses");

/** Email the admins send to the IIT administration to book a venue (opened as a Gmail draft). */
export const venueRequestTemplateSchema = z.object({
  to: emailList,
  cc: emailList,
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(3000),
});

export type VenueRequestTemplate = z.infer<typeof venueRequestTemplateSchema>;

export const settingDefinitions = {
  attendanceThreshold: {
    label: "Practices needed before WhatsApp groups",
    schema: z.number().int().min(1).max(20),
    defaultValue: 3,
  },
  inactiveAfterWeeks: {
    label: "Flag members as 'stopped coming' after (weeks)",
    schema: z.number().int().min(1).max(52),
    defaultValue: 4,
  },
  inviteMessageTemplate: {
    label: "WhatsApp invite message template",
    schema: z
      .string()
      .min(10)
      .max(2000)
      .refine((value) => value.includes("{groupList}"), {
        message: "Template must contain {groupList}",
      }),
    defaultValue: DEFAULT_INVITE_TEMPLATE,
  },
  practiceVenue: {
    label: "Practice venue",
    schema: venueSchema,
    // Placeholder: IIT, Ramakrishna Road, Colombo 06. Confirm in Settings.
    defaultValue: { name: "IIT — Ramakrishna Road, Colombo 06", latitude: 6.868, longitude: 79.859 } as Venue,
  },
  venueRequestTemplate: {
    label: "Venue request email",
    schema: venueRequestTemplateSchema,
    defaultValue: {
      to: [],
      cc: [],
      subject: "Venue request: Vocal Impact practice on {date}",
      body: DEFAULT_VENUE_REQUEST_BODY,
    } as VenueRequestTemplate,
  },
  carpoolClusterRadiusKm: {
    label: "Carpool: group members living within (km)",
    schema: z.number().min(0.5).max(20),
    defaultValue: 3,
  },
  carpoolMaxDetourKm: {
    label: "Carpool: maximum driver detour (km)",
    schema: z.number().min(0.5).max(20),
    defaultValue: 2,
  },
} as const;

export type SettingKey = keyof typeof settingDefinitions;

export type SettingValue<K extends SettingKey> = (typeof settingDefinitions)[K]["defaultValue"] extends infer V
  ? V extends number
    ? number
    : V extends string
      ? string
      : V
  : never;

export type AppSettings = { [K in SettingKey]: SettingValue<K> };
