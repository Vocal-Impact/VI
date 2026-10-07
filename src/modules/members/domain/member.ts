import { parsePhoneNumberFromString } from "libphonenumber-js";
import { isIsoDate, type IsoDate } from "@/shared/lib/dates";

/**
 * Member value rules and normalisers. Pure functions shared by the manual
 * "Add member" form and every CSV import profile, so both paths accept and
 * reject exactly the same data.
 */

export const VOICE_TYPES = ["SOPRANO", "ALTO", "TENOR", "BASS", "UNASSIGNED"] as const;
export type VoiceType = (typeof VOICE_TYPES)[number];

export const MEMBER_STATUSES = ["PROSPECTIVE", "ACTIVE", "INACTIVE", "ALUMNI"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const VOICE_TYPE_LABELS: Record<VoiceType, string> = {
  SOPRANO: "Soprano",
  ALTO: "Alto",
  TENOR: "Tenor",
  BASS: "Bass",
  UNASSIGNED: "Not assigned",
};

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  PROSPECTIVE: "Prospective",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ALUMNI: "Alumni",
};

/** IIT levels in order. Members move up one every 1 September; after L6 they become alumni. */
export const STUDY_LEVELS = ["FOUNDATION", "L4", "L5", "PLACEMENT", "L6"] as const;
export type StudyLevel = (typeof STUDY_LEVELS)[number];

export const STUDY_LEVEL_LABELS: Record<StudyLevel, string> = {
  FOUNDATION: "Foundation",
  L4: "L4",
  L5: "L5",
  PLACEMENT: "Placement Year",
  L6: "L6",
};

/** The level after the September rollover, or "GRADUATED" after L6. */
export function nextStudyLevel(level: StudyLevel): StudyLevel | "GRADUATED" {
  const index = STUDY_LEVELS.indexOf(level);
  return STUDY_LEVELS[index + 1] ?? "GRADUATED";
}

export const MAX_DIETARY_PREFERENCE_LENGTH = 200;

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const success = <T>(value: T): Parsed<T> => ({ ok: true, value });
const failure = (message: string): Parsed<never> => ({ ok: false, message });

/** Trims and collapses whitespace; title-cases names typed in ALL CAPS or all lowercase. */
export function normalizeName(raw: string): Parsed<string> {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length === 0) return failure("Required");
  if (value.length > 50) return failure("Must be 50 characters or fewer");
  const isSingleCase = value === value.toLowerCase() || value === value.toUpperCase();
  if (!isSingleCase) return success(value);
  return success(
    value.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase()),
  );
}

export function normalizeStudentId(raw: string): Parsed<string> {
  const value = raw.replace(/\s+/g, "").toUpperCase();
  if (value.length === 0) return failure("Required");
  if (!/^[A-Z0-9/-]{3,20}$/.test(value)) return failure("Use 3–20 letters, digits, '/' or '-'");
  return success(value);
}

/**
 * Accepts the form's answers ("Foundation", "L4", "Level 5", "Placement Year",
 * "L6") and the old year numbers ("1st year" = L4 … "4th year" = L6).
 */
export function parseStudyLevel(raw: string): Parsed<StudyLevel> {
  const text = raw.trim().toLowerCase();
  if (text.length === 0) return failure("Required");
  if (STUDY_LEVELS.includes(raw.trim() as StudyLevel)) return success(raw.trim() as StudyLevel);
  if (text.includes("foundation")) return success("FOUNDATION");
  if (text.includes("placement") || text.includes("industr") || text.includes("internship"))
    return success("PLACEMENT");
  if (text.includes("final")) return success("L6");
  if (["done", "finished", "completed", "graduated", "passed out", "alumni"].some((word) => text.startsWith(word)))
    return success("L6");
  const level = text.match(/^(?:l|level)\s*([4-6])\b/);
  if (level) return success(`L${level[1]}` as StudyLevel);
  const year = text.match(/^(?:year\s*)?([1-4])(?:st|nd|rd|th)?(?:\s*year)?$/);
  if (year) return success((["L4", "L5", "PLACEMENT", "L6"] as const)[Number(year[1]) - 1]!);
  return failure("Choose Foundation, L4, L5, Placement Year or L6");
}

/** Optional free text such as "Vegetarian, no nuts". Empty → null. */
export function normalizeDietaryPreference(raw: string): Parsed<string | null> {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value === "" || /^(none|no|n\/?a|nil|-)$/i.test(value)) return success(null);
  if (value.length > MAX_DIETARY_PREFERENCE_LENGTH)
    return failure(`Must be ${MAX_DIETARY_PREFERENCE_LENGTH} characters or fewer`);
  return success(value);
}

/**
 * Maps a form's status answer ("Active", "Oldie", "New member", "Newbie",
 * "Alumni"). Blank → null (decided by the importer).
 */
export function parseMemberStatus(raw: string): Parsed<MemberStatus | null> {
  const value = raw.trim().toLowerCase();
  if (value === "") return success(null);
  if (value.startsWith("inactive") || value.startsWith("not active")) return success("INACTIVE");
  if (
    ["active", "current", "existing", "oldie", "old member", "old", "senior", "returning"].some((word) =>
      value.startsWith(word),
    )
  )
    return success("ACTIVE");
  if (value.startsWith("alum") || value.startsWith("graduated") || value.startsWith("past")) return success("ALUMNI");
  if (["prospective", "new", "fresher", "first"].some((word) => value.startsWith(word))) return success("PROSPECTIVE");
  return failure("Use Prospective (or Newbie), Active (or Oldie), Inactive or Alumni");
}

/** Normalises to E.164 (e.g. +94771234567). Local numbers default to Sri Lanka. */
export function normalizeWhatsappNumber(raw: string): Parsed<string> {
  const value = raw.trim();
  if (value.length === 0) return failure("Required");
  const phone = parsePhoneNumberFromString(value, "LK");
  if (!phone || !phone.isValid()) return failure("Not a valid phone number");
  return success(phone.number);
}

export function normalizeEmail(raw: string, allowedDomain?: string): Parsed<string> {
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return failure("Required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return failure("Not a valid email address");
  if (allowedDomain) {
    const domain = value.slice(value.lastIndexOf("@") + 1);
    const allowed = allowedDomain.toLowerCase();
    if (domain !== allowed && !domain.endsWith(`.${allowed}`)) return failure(`Must be an @${allowed} address`);
  }
  return success(value);
}

/** Maps free-text form answers ("Soprano 1", "Baritone", "Not sure") to a voice type. */
export function parseVoiceType(raw: string): VoiceType {
  const value = raw.trim().toLowerCase();
  // Mezzo-sopranos usually sing with the altos in a choir.
  if (value.includes("mezzo") || value.includes("alto")) return "ALTO";
  if (value.includes("soprano")) return "SOPRANO";
  if (value.includes("tenor")) return "TENOR";
  if (value.includes("bass") || value.includes("baritone")) return "BASS";
  return "UNASSIGNED";
}

export type DateOrder = "DMY" | "MDY";

/**
 * Parses a date of birth from a form/CSV cell. Accepts ISO `YYYY-MM-DD` and
 * `D/M/YYYY` style dates (separator `/`, `-` or `.`). When day and month are
 * both ≤ 12 the configured order decides (Sri Lankan sheets default to DMY).
 */
export function parseDateOfBirth(raw: string, today: IsoDate, order: DateOrder = "DMY"): Parsed<IsoDate> {
  const value = raw.trim();
  if (value.length === 0) return failure("Required");

  let iso: string | undefined;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number) as [number, number, number];
    iso = toIso(y, m, d);
  } else {
    const parts = value.split(/[/.-]/).map((part) => part.trim());
    if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
      const [a, b, c] = parts.map(Number) as [number, number, number];
      const year = c < 100 ? 2000 + c : c;
      let day = order === "DMY" ? a : b;
      let month = order === "DMY" ? b : a;
      if (month > 12 && day <= 12) [day, month] = [month, day];
      iso = toIso(year, month, day);
    }
  }

  if (!iso || !isIsoDate(iso)) return failure("Not a valid date (use YYYY-MM-DD or DD/MM/YYYY)");

  const age = Number(today.slice(0, 4)) - Number(iso.slice(0, 4));
  if (age < 14 || age > 60) return failure("Date of birth looks wrong (age must be 14–60)");
  return success(iso);
}

function toIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function fullName(member: { firstName: string; lastName: string }): string {
  return `${member.firstName} ${member.lastName}`;
}
