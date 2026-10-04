import { z } from "zod";
import { isIsoDate } from "@/shared/lib/dates";
import { isValidTime, RSVP_RESPONSES } from "./domain/practice";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);

export const practiceInputSchema = z
  .object({
    date: z.string().refine(isIsoDate, "Enter a valid date"),
    startTime: z.string().refine(isValidTime, "Enter a start time"),
    endTime: z
      .string()
      .optional()
      .transform((value) => value || null)
      .refine((value) => value === null || isValidTime(value), "Enter a valid end time"),
    title: z.string().trim().min(1, "Title is required").max(100),
    venue: optionalText(120),
    notes: optionalText(500),
  })
  .refine((value) => !value.endTime || value.endTime > value.startTime, {
    path: ["endTime"],
    message: "End time must be after the start time",
  });

export type PracticeInput = z.infer<typeof practiceInputSchema>;

export const attendanceToggleSchema = z.object({
  practiceId: z.uuid(),
  memberId: z.uuid(),
  present: z.boolean(),
});

export const rsvpSchema = z.object({
  practiceId: z.uuid(),
  memberId: z.uuid(),
  response: z.enum(RSVP_RESPONSES),
});
