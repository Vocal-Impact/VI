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

/** 0 = Foundation year. */
export const MIN_YEAR_OF_STUDY = 0;
export const MAX_YEAR_OF_STUDY = 5;

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

/** Accepts "2", "2nd Year", "Year 2", "Foundation", "L5" … */
export function parseYearOfStudy(raw: string | number): Parsed<number> {
  const text = String(raw).trim().toLowerCase();
  if (text.length === 0) return failure("Required");
  if (text.includes("foundation")) return success(0);
  const match = text.match(/\d+/);
  if (!match) return failure("Enter a year between 1 and 5 (or Foundation)");
  const year = Number(match[0]);
  if (year < MIN_YEAR_OF_STUDY || year > MAX_YEAR_OF_STUDY)
    return failure("Enter a year between 1 and 5 (or Foundation)");
  return success(year);
}

export function formatYearOfStudy(year: number): string {
  return year === 0 ? "Foundation" : `Year ${year}`;
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
