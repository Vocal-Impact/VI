import {
  normalizeEmail,
  normalizeName,
  normalizeStudentId,
  normalizeWhatsappNumber,
  parseDateOfBirth,
  parseVoiceType,
  parseYearOfStudy,
  type Parsed,
  type VoiceType,
} from "@/modules/members/domain";
import type { IsoDate } from "@/shared/lib/dates";
import { resolveColumns, type ColumnSpec, type ParsedCsv } from "../csv";
import { csvLine, diffFields, emptyPreview, splitDuplicateRows, type ImportPreview, type RowIssue } from "../preview";

/** Profile for the main Google Form ("join the choir"). */

type Field =
  "firstName" | "lastName" | "studentId" | "yearOfStudy" | "whatsappNumber" | "email" | "voiceType" | "dateOfBirth";

export const REGISTRATION_COLUMNS: readonly ColumnSpec<Field>[] = [
  { field: "firstName", headers: ["First Name"], required: true },
  { field: "lastName", headers: ["Last Name"], required: true },
  { field: "studentId", headers: ["IIT Student ID", "Student ID"], required: true },
  { field: "yearOfStudy", headers: ["Current Year of Study", "Year of Study"], required: true },
  { field: "whatsappNumber", headers: ["WhatsApp Number", "Whatsapp No", "Phone Number"], required: true },
  { field: "email", headers: ["IIT Email Address", "IIT Email", "Email Address", "Email"], required: true },
  { field: "voiceType", headers: ["What is your voice type?", "Voice Type"], required: true },
  { field: "dateOfBirth", headers: ["Date of Birth", "Birthday"], required: false },
];

export interface RegistrationData {
  firstName: string;
  lastName: string;
  studentId: string;
  yearOfStudy: number;
  whatsappNumber: string;
  email: string;
  voiceType: VoiceType;
  dateOfBirth: IsoDate | null;
}

export interface ExistingMemberSnapshot extends RegistrationData {
  id: string;
}

const LABELS: Partial<Record<keyof RegistrationData, string>> = {
  firstName: "First name",
  lastName: "Last name",
  yearOfStudy: "Year",
  whatsappNumber: "WhatsApp",
  email: "Email",
  voiceType: "Voice type",
  dateOfBirth: "Date of birth",
};

export interface RegistrationOptions {
  allowedDomain?: string;
  today: IsoDate;
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
  const yearOfStudy = take("Year of study", parseYearOfStudy(cells.yearOfStudy ?? ""));
  const whatsappNumber = take("WhatsApp number", normalizeWhatsappNumber(cells.whatsappNumber ?? ""));
  const email = take("Email", normalizeEmail(cells.email ?? "", options.allowedDomain));
  const voiceType = parseVoiceType(cells.voiceType ?? "");
  const dobCell = cells.dateOfBirth?.trim() ?? "";
  const dateOfBirth = dobCell === "" ? null : (take("Date of birth", parseDateOfBirth(dobCell, options.today)) ?? null);

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
    },
  };
}

/**
 * Keeps data the committee already curated: a form answer of "Not sure" never
 * replaces an assigned voice type, and a blank birthday never erases one.
 */
export function mergeWithExisting(next: RegistrationData, existing: ExistingMemberSnapshot): RegistrationData {
  return {
    ...next,
    voiceType: next.voiceType === "UNASSIGNED" ? existing.voiceType : next.voiceType,
    dateOfBirth: next.dateOfBirth ?? existing.dateOfBirth,
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
    const changes = diffFields(existing, merged, LABELS);
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
