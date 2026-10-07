import {
  normalizeDietaryPreference,
  normalizeEmail,
  normalizeName,
  normalizeStudentId,
  normalizeWhatsappNumber,
  parseDateOfBirth,
  parseMemberStatus,
  parseStudyLevel,
  parseVoiceType,
  STUDY_LEVEL_LABELS,
  type MemberStatus,
  type Parsed,
  type StudyLevel,
  type VoiceType,
} from "@/modules/members/domain";
import { formatCoordinates, parseCoordinates, type Coordinates } from "@/shared/lib/coordinates";
import type { IsoDate } from "@/shared/lib/dates";
import { resolveColumns, type ColumnSpec, type ParsedCsv } from "../csv";
import { csvLine, diffFields, emptyPreview, splitDuplicateRows, type ImportPreview, type RowIssue } from "../preview";

/**
 * Profile for the main Google Form ("join the choir"):
 * Timestamp, Email Address, First Name, Last Name, IIT Student ID, WhatsApp
 * Number, Voice Type (Section in choir), Year of Study, Date of Birth, Status,
 * Location (Nearest Landmark), Dietary Preferences — plus the "Location
 * Coordinates" column that scripts/geocode/geocode_locations.py adds.
 * New members are Prospective unless `useStatusColumn` is set (first load only).
 * Older exports ("IIT Email Address", "What is your voice type?") still work.
 */

type Field =
  | "firstName"
  | "lastName"
  | "studentId"
  | "yearOfStudy"
  | "whatsappNumber"
  | "email"
  | "voiceType"
  | "dateOfBirth"
  | "status"
  | "location"
  | "coordinates"
  | "dietaryPreference";

export const REGISTRATION_COLUMNS: readonly ColumnSpec<Field>[] = [
  { field: "firstName", headers: ["First Name"], required: true },
  { field: "lastName", headers: ["Last Name"], required: true },
  { field: "studentId", headers: ["IIT Student ID", "Student ID"], required: true },
  {
    field: "yearOfStudy",
    headers: ["Current Year of Study", "Year of Study", "Current Level", "Level", "Year"],
    required: true,
  },
  { field: "whatsappNumber", headers: ["WhatsApp Number", "Whatsapp No", "Phone Number"], required: true },
  { field: "email", headers: ["IIT Email Address", "IIT Email", "Email Address", "Email"], required: true },
  {
    field: "voiceType",
    headers: ["Voice Type (Section in choir)", "What is your voice type?", "Voice Type", "Section in choir", "Section"],
    required: true,
  },
  { field: "dateOfBirth", headers: ["Date of Birth", "Birthday"], required: false },
  { field: "status", headers: ["Status", "Member Status"], required: false },
  // The script's column first, so it isn't mistaken for the landmark column.
  {
    field: "coordinates",
    headers: ["Location Coordinates", "Coordinates", "Latitude, Longitude", "Lat Long"],
    required: false,
  },
  {
    field: "location",
    headers: [
      "Location(Nearerst Landmark)",
      "Location (Nearest Landmark)",
      "Nearest Landmark",
      "Location",
      "Which area do you live in?",
      "Area",
    ],
    required: false,
  },
  {
    field: "dietaryPreference",
    headers: ["Dietary Preferences", "Dietary Preference", "Dietary Requirements", "Dietary Restrictions"],
    required: false,
  },
];

/** Where they live: the landmark as typed and, when known, its coordinates. */
export interface RegistrationLocation {
  areaLabel: string;
  coordinates: Coordinates | null;
  canDrive: boolean;
  seats: number;
}

export interface RegistrationData {
  firstName: string;
  lastName: string;
  studentId: string;
  yearOfStudy: StudyLevel;
  whatsappNumber: string;
  email: string;
  voiceType: VoiceType;
  dateOfBirth: IsoDate | null;
  dietaryPreference: string | null;
  /** From the form; only applied when the import creates the member. */
  status: MemberStatus | null;
  location: RegistrationLocation | null;
}

export interface ExistingMemberSnapshot extends Omit<RegistrationData, "status"> {
  id: string;
  status: MemberStatus;
}

const SRI_LANKA = { minLat: 5.5, maxLat: 10, minLng: 79.4, maxLng: 82 };
const MAX_AREA_LENGTH = 80;

function inSriLanka(point: Coordinates): boolean {
  return (
    point.latitude >= SRI_LANKA.minLat &&
    point.latitude <= SRI_LANKA.maxLat &&
    point.longitude >= SRI_LANKA.minLng &&
    point.longitude <= SRI_LANKA.maxLng
  );
}

/** Landmark text and/or coordinates → a location (coordinates typed as the landmark count too). */
export function parseLocation(landmarkCell: string, coordinatesCell: string): Parsed<RegistrationLocation | null> {
  const landmark = landmarkCell.trim().replace(/\s+/g, " ");
  const coordinatesText = coordinatesCell.trim();
  let coordinates: Coordinates | null = null;
  if (coordinatesText) {
    coordinates = parseCoordinates(coordinatesText);
    if (!coordinates) return { ok: false, message: "Coordinates must look like 6.8664, 79.8774" };
  } else if (landmark) {
    coordinates = parseCoordinates(landmark);
  }
  if (coordinates && !inSriLanka(coordinates)) return { ok: false, message: "Coordinates are outside Sri Lanka" };
  if (!landmark && !coordinates) return { ok: true, value: null };
  const areaLabel = (landmark || formatCoordinates(coordinates!)).slice(0, MAX_AREA_LENGTH);
  if (areaLabel.length < 2) return { ok: false, message: "Too short — name the nearest landmark" };
  return { ok: true, value: { areaLabel, coordinates, canDrive: false, seats: 0 } };
}

const LABELS = {
  firstName: "First name",
  lastName: "Last name",
  yearOfStudy: "Year",
  whatsappNumber: "WhatsApp",
  email: "Email",
  voiceType: "Voice type",
  dateOfBirth: "Date of birth",
  dietaryPreference: "Dietary",
  location: "Location",
  coordinates: "Coordinates",
} as const;

export interface RegistrationOptions {
  allowedDomain?: string;
  today: IsoDate;
  /**
   * Read the Status column for new members. Off by default: the form goes to
   * newcomers, so everyone new is Prospective. Turned on only for the very
   * first load of existing members.
   */
  useStatusColumn?: boolean;
}

export function parseRegistrationRow(
  cells: Partial<Record<Field, string>>,
  options: RegistrationOptions,
): { ok: true; value: RegistrationData } | { ok: false; messages: string[] } {
  const messages: string[] = [];
  const take = <T>(label: string, result: Parsed<T>): T | undefined => {
    if (result.ok) return result.value;
    messages.push(`${label}: ${result.message}`);
    return undefined;
  };

  const firstName = take("First name", normalizeName(cells.firstName ?? ""));
  const lastName = take("Last name", normalizeName(cells.lastName ?? ""));
  const studentId = take("Student ID", normalizeStudentId(cells.studentId ?? ""));
  const yearOfStudy = take("Year of study", parseStudyLevel(cells.yearOfStudy ?? ""));
  const whatsappNumber = take("WhatsApp number", normalizeWhatsappNumber(cells.whatsappNumber ?? ""));
  const email = take("Email", normalizeEmail(cells.email ?? "", options.allowedDomain));
  const voiceType = parseVoiceType(cells.voiceType ?? "");
  const dobCell = cells.dateOfBirth?.trim() ?? "";
  const dateOfBirth = dobCell === "" ? null : (take("Date of birth", parseDateOfBirth(dobCell, options.today)) ?? null);
  const status = options.useStatusColumn ? (take("Status", parseMemberStatus(cells.status ?? "")) ?? null) : null;
  const dietaryPreference =
    take("Dietary preferences", normalizeDietaryPreference(cells.dietaryPreference ?? "")) ?? null;
  const location = take("Location", parseLocation(cells.location ?? "", cells.coordinates ?? "")) ?? null;

  if (messages.length > 0) return { ok: false, messages };
  return {
    ok: true,
    value: {
      firstName: firstName!,
      lastName: lastName!,
      studentId: studentId!,
      yearOfStudy: yearOfStudy!,
      whatsappNumber: whatsappNumber!,
      email: email!,
      voiceType,
      dateOfBirth,
      dietaryPreference,
      status,
      location,
    },
  };
}

/**
 * Keeps data the committee already curated: a form answer of "Not sure" never
 * replaces an assigned voice type, blanks never erase a birthday, dietary
 * preference or location, carpool details (driver, seats) are kept, and the
 * status of an existing member is never changed by an import.
 */
export function mergeWithExisting(next: RegistrationData, existing: ExistingMemberSnapshot): RegistrationData {
  const location = next.location
    ? {
        ...next.location,
        canDrive: existing.location?.canDrive ?? false,
        seats: existing.location?.seats ?? 0,
        // Same landmark, no new coordinates → keep the ones already found.
        coordinates:
          next.location.coordinates ??
          (existing.location?.areaLabel.toLowerCase() === next.location.areaLabel.toLowerCase()
            ? existing.location.coordinates
            : null),
      }
    : existing.location;
  return {
    ...next,
    voiceType: next.voiceType === "UNASSIGNED" ? existing.voiceType : next.voiceType,
    dateOfBirth: next.dateOfBirth ?? existing.dateOfBirth,
    dietaryPreference: next.dietaryPreference ?? existing.dietaryPreference,
    status: existing.status,
    location,
  };
}

/** Flat, display-friendly values for the preview's "what changes" list. */
function forDiff(data: Omit<RegistrationData, "status">) {
  return {
    ...data,
    yearOfStudy: STUDY_LEVEL_LABELS[data.yearOfStudy],
    location: data.location?.areaLabel ?? null,
    coordinates: data.location?.coordinates ? formatCoordinates(data.location.coordinates) : null,
  };
}

export function buildRegistrationPreview(
  csv: ParsedCsv,
  existingMembers: readonly ExistingMemberSnapshot[],
  options: RegistrationOptions,
): ImportPreview<RegistrationData> {
  const { columns, missing } = resolveColumns(csv.headers, REGISTRATION_COLUMNS);
  if (missing.length > 0) return emptyPreview(csv.rows.length, missing);

  const preview = emptyPreview<RegistrationData>(csv.rows.length);
  const valid: Array<{ index: number; value: RegistrationData }> = [];

  csv.rows.forEach((row, index) => {
    const cells = Object.fromEntries(
      Object.entries(columns).map(([field, header]) => [field, row[header as string] ?? ""]),
    ) as Partial<Record<Field, string>>;
    const parsed = parseRegistrationRow(cells, options);
    if (parsed.ok) valid.push({ index, value: parsed.value });
    else preview.invalid.push({ row: csvLine(index), studentId: cells.studentId, messages: parsed.messages });
  });

  const { kept, duplicates } = splitDuplicateRows(valid);
  preview.duplicates = duplicates;

  const byStudentId = new Map(existingMembers.map((member) => [member.studentId, member]));
  const byEmail = new Map(existingMembers.map((member) => [member.email, member]));
  const emailsInFile = new Map<string, string>();

  for (const { index, value } of kept) {
    const issues: RowIssue["messages"] = [];
    const owner = byEmail.get(value.email);
    if (owner && owner.studentId !== value.studentId)
      issues.push(`Email already belongs to student ${owner.studentId}`);
    const fileOwner = emailsInFile.get(value.email);
    if (fileOwner && fileOwner !== value.studentId) issues.push(`Email also used by student ${fileOwner} in this file`);
    emailsInFile.set(value.email, value.studentId);
    if (issues.length > 0) {
      preview.invalid.push({ row: csvLine(index), studentId: value.studentId, messages: issues });
      continue;
    }

    const label = `${value.firstName} ${value.lastName}`;
    const existing = byStudentId.get(value.studentId);
    if (!existing) {
      preview.created.push({ row: csvLine(index), studentId: value.studentId, label, data: value, changes: [] });
      continue;
    }
    const merged = mergeWithExisting(value, existing);
    const changes = diffFields(forDiff(existing), forDiff(merged), LABELS);
    const item = {
      row: csvLine(index),
      studentId: value.studentId,
      label,
      data: merged,
      memberId: existing.id,
      changes,
    };
    (changes.length > 0 ? preview.updated : preview.unchanged).push(item);
  }

  preview.invalid.sort((a, b) => a.row - b.row);
  return preview;
}
