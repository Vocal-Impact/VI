import { z } from "zod";
import { isIsoDate } from "@/shared/lib/dates";
import { STUDY_LEVELS } from "@/modules/members/domain";
import { isValidTime, PRACTICE_AUDIENCES, RSVP_RESPONSES } from "./domain/practice";

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
    audience: z.enum(PRACTICE_AUDIENCES).optional().default("MEMBERS"),
    /** LEVELS practices: the levels invited. */
    levels: z.array(z.enum(STUDY_LEVELS)).optional().default([]),
    /** SELECTED practices: the members invited. */
    memberIds: z.array(z.uuid()).max(500).optional().default([]),
  })
  .refine((value) => !value.endTime || value.endTime > value.startTime, {
    path: ["endTime"],
    message: "End time must be after the start time",
  })
  .refine((value) => value.audience !== "LEVELS" || value.levels.length > 0, {
    path: ["levels"],
    message: "Choose at least one level",
  })
  .refine((value) => value.audience !== "SELECTED" || value.memberIds.length > 0, {
    path: ["memberIds"],
    message: "Choose at least one member",
  })
  // Keep only what the audience uses.
  .transform((value) => ({
    ...value,
    levels: value.audience === "LEVELS" ? [...new Set(value.levels)] : [],
    memberIds: value.audience === "SELECTED" ? [...new Set(value.memberIds)] : [],
  }));

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
