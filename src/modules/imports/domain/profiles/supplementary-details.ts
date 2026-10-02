import { normalizeStudentId, parseDateOfBirth } from "@/modules/members/domain";
import type { IsoDate } from "@/shared/lib/dates";
import { parseYesNo, resolveColumns, type ColumnSpec, type ParsedCsv } from "../csv";
import { csvLine, diffFields, emptyPreview, splitDuplicateRows, type ImportPreview } from "../preview";

/** Profile for the follow-up Google Form (birthday, area, carpool details). */

type Field = "studentId" | "dateOfBirth" | "areaLabel" | "consent" | "canDrive" | "seats";

export const SUPPLEMENTARY_COLUMNS: readonly ColumnSpec<Field>[] = [
  { field: "studentId", headers: ["IIT Student ID", "Student ID"], required: true },
  { field: "dateOfBirth", headers: ["Date of Birth", "Birthday"], required: false },
  {
    field: "areaLabel",
    headers: ["Which area do you live in?", "Area you live in", "Area", "Home Area"],
    required: false,
  },
  {
    field: "consent",
    headers: ["Can we use your approximate location for carpooling?", "Carpool consent", "Location consent"],
    required: false,
  },
  { field: "canDrive", headers: ["Can you drive to practices?", "Can you drive?"], required: false },
  { field: "seats", headers: ["How many passengers can you take?", "Seats", "Passenger seats"], required: false },
];

export interface LocationDetails {
  areaLabel: string;
  canDrive: boolean;
  seats: number;
}

export interface SupplementaryData {
  studentId: string;
  dateOfBirth: IsoDate | null;
  /** `null` = no consent → any stored location is removed. `undefined` = column absent, leave as is. */
  location: LocationDetails | null | undefined;
}

export interface ExistingSupplementarySnapshot {
  id: string;
  studentId: string;
  name: string;
  dateOfBirth: IsoDate | null;
  location: LocationDetails | null;
}

const MAX_SEATS = 6;

export function buildSupplementaryPreview(
  csv: ParsedCsv,
  existingMembers: readonly ExistingSupplementarySnapshot[],
  options: { today: IsoDate },
): ImportPreview<SupplementaryData> {
  const { columns, missing } = resolveColumns(csv.headers, SUPPLEMENTARY_COLUMNS);
  if (missing.length > 0) return emptyPreview(csv.rows.length, missing);
  if (!columns.dateOfBirth && !columns.areaLabel) {
    return emptyPreview(csv.rows.length, ["Date of Birth or Which area do you live in?"]);
  }

  const preview = emptyPreview<SupplementaryData>(csv.rows.length);
  const valid: Array<{ index: number; value: SupplementaryData }> = [];
  const cell = (row: Record<string, string>, field: Field) =>
    columns[field] ? (row[columns[field]] ?? "").trim() : "";

  csv.rows.forEach((row, index) => {
    const messages: string[] = [];
    const studentId = normalizeStudentId(cell(row, "studentId"));
    if (!studentId.ok) messages.push(`Student ID: ${studentId.message}`);

    let dateOfBirth: IsoDate | null = null;
    const dobCell = cell(row, "dateOfBirth");
    if (dobCell) {
      const parsed = parseDateOfBirth(dobCell, options.today);
      if (parsed.ok) dateOfBirth = parsed.value;
      else messages.push(`Date of birth: ${parsed.message}`);
    }

    let location: SupplementaryData["location"];
    if (columns.areaLabel) {
      const consent = parseYesNo(cell(row, "consent")) ?? false;
      const area = cell(row, "areaLabel").replace(/\s+/g, " ");
      if (!consent) {
        location = null;
      } else if (area.length < 2) {
        messages.push("Area: required when location consent is given");
      } else {
        const canDrive = parseYesNo(cell(row, "canDrive")) ?? false;
        const seatsCell = cell(row, "seats");
        const seats = seatsCell === "" ? 0 : Number.parseInt(seatsCell, 10);
        if (Number.isNaN(seats) || seats < 0 || seats > MAX_SEATS)
          messages.push(`Seats: enter a number from 0 to ${MAX_SEATS}`);
        location = { areaLabel: area.slice(0, 80), canDrive, seats: canDrive ? seats : 0 };
      }
    }

    if (messages.length > 0 || !studentId.ok) {
      preview.invalid.push({ row: csvLine(index), studentId: cell(row, "studentId"), messages });
      return;
    }
    valid.push({ index, value: { studentId: studentId.value, dateOfBirth, location } });
  });

  const { kept, duplicates } = splitDuplicateRows(valid);
  preview.duplicates = duplicates;
  const byStudentId = new Map(existingMembers.map((member) => [member.studentId, member]));

  for (const { index, value } of kept) {
    const existing = byStudentId.get(value.studentId);
    if (!existing) {
      preview.invalid.push({
        row: csvLine(index),
        studentId: value.studentId,
        messages: ["No member with this student ID — import the registration form first or add them manually"],
      });
      continue;
    }
    const merged: SupplementaryData = {
      ...value,
      dateOfBirth: value.dateOfBirth ?? existing.dateOfBirth,
      location: value.location === undefined ? existing.location : value.location,
    };
    const changes = diffFields(
      flatten(existing.dateOfBirth, existing.location),
      flatten(merged.dateOfBirth, merged.location ?? null),
      { dateOfBirth: "Date of birth", area: "Area", canDrive: "Can drive", seats: "Seats" },
    );
    const item = {
      row: csvLine(index),
      studentId: value.studentId,
      label: existing.name,
      data: merged,
      memberId: existing.id,
      changes,
    };
    (changes.length > 0 ? preview.updated : preview.unchanged).push(item);
  }

  preview.invalid.sort((a, b) => a.row - b.row);
  return preview;
}

function flatten(dateOfBirth: IsoDate | null, location: LocationDetails | null) {
  return {
    dateOfBirth,
    area: location?.areaLabel ?? null,
    canDrive: location ? (location.canDrive ? "Yes" : "No") : null,
    seats: location ? location.seats : null,
  };
}
