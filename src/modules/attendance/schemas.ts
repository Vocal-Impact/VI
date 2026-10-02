import { z } from "zod";
import { isIsoDate } from "@/shared/lib/dates";

export const practiceInputSchema = z.object({
  date: z.string().refine(isIsoDate, "Enter a valid date"),
  title: z.string().trim().min(1, "Title is required").max(100),
  venue: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || null),
});

export type PracticeInput = z.infer<typeof practiceInputSchema>;

export const attendanceToggleSchema = z.object({
  practiceId: z.uuid(),
  memberId: z.uuid(),
  present: z.boolean(),
});
