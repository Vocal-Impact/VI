import { z } from "zod";

export const memberLocationInputSchema = z.object({
  areaLabel: z.string().trim().min(2, "Enter an area, e.g. Dehiwala").max(80),
  consentGiven: z.literal(true, { error: "The member must consent before a location is stored" }),
  canDrive: z.boolean(),
  seats: z.coerce.number().int().min(0).max(6),
});

export type MemberLocationInput = z.infer<typeof memberLocationInputSchema>;
