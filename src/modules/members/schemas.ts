import { z } from "zod";
import {
  MEMBER_STATUSES,
  VOICE_TYPES,
  normalizeEmail,
  normalizeName,
  normalizeStudentId,
  normalizeWhatsappNumber,
  parseYearOfStudy,
  type Parsed,
} from "./domain/member";
import { isIsoDate } from "@/shared/lib/dates";

/** Turns a domain parser into a Zod string field so forms and imports share rules. */
export function parsedField<T>(parse: (raw: string) => Parsed<T>) {
  return z.string().transform((raw, ctx) => {
    const result = parse(raw);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.message });
      return z.NEVER;
    }
    return result.value;
  });
}

const optionalDate = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    if (!isIsoDate(value)) {
      ctx.addIssue({ code: "custom", message: "Not a valid date" });
      return z.NEVER;
    }
    return value;
  });

/** Input for creating/editing a member by hand. `allowedDomain` enforces IIT emails. */
export function memberInputSchema(allowedDomain?: string) {
  return z.object({
    firstName: parsedField(normalizeName),
    lastName: parsedField(normalizeName),
    studentId: parsedField(normalizeStudentId),
    yearOfStudy: parsedField(parseYearOfStudy),
    whatsappNumber: parsedField(normalizeWhatsappNumber),
    email: parsedField((raw) => normalizeEmail(raw, allowedDomain)),
    voiceType: z.enum(VOICE_TYPES),
    dateOfBirth: optionalDate.optional().transform((value) => value ?? null),
  });
}

export type MemberInput = z.infer<ReturnType<typeof memberInputSchema>>;

export const memberStatusSchema = z.enum(MEMBER_STATUSES);

export const memberFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(MEMBER_STATUSES).optional(),
  voiceType: z.enum(VOICE_TYPES).optional(),
  year: z.coerce.number().int().min(0).max(5).optional(),
  /** Show removed (soft-deleted) members instead of current ones. */
  removed: z.boolean().optional(),
});

export type MemberFilter = z.infer<typeof memberFilterSchema>;
