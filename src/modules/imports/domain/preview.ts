/** Shared preview shapes for every import profile. */

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface PreviewItem<T> {
  row: number;
  studentId: string;
  label: string;
  data: T;
  memberId?: string;
  changes: FieldChange[];
}

export interface RowIssue {
  row: number;
  studentId?: string;
  messages: string[];
}

export interface ImportPreview<T> {
  totalRows: number;
  missingColumns: string[];
  created: PreviewItem<T>[];
  updated: PreviewItem<T>[];
  unchanged: PreviewItem<T>[];
  invalid: RowIssue[];
  duplicates: RowIssue[];
}

/** CSV line number of a data row (header is line 1). */
export const csvLine = (index: number): number => index + 2;

export function emptyPreview<T>(totalRows: number, missingColumns: string[] = []): ImportPreview<T> {
  return { totalRows, missingColumns, created: [], updated: [], unchanged: [], invalid: [], duplicates: [] };
}

/**
 * Google Forms lets people submit twice. The latest submission wins, so for
 * each student ID keep only the last row and report earlier ones.
 */
export function splitDuplicateRows<T extends { studentId: string }>(
  rows: Array<{ index: number; value: T }>,
): { kept: Array<{ index: number; value: T }>; duplicates: RowIssue[] } {
  const lastIndex = new Map<string, number>();
  for (const row of rows) lastIndex.set(row.value.studentId, row.index);
  const kept: Array<{ index: number; value: T }> = [];
  const duplicates: RowIssue[] = [];
  for (const row of rows) {
    const keptIndex = lastIndex.get(row.value.studentId);
    if (keptIndex === row.index) kept.push(row);
    else
      duplicates.push({
        row: csvLine(row.index),
        studentId: row.value.studentId,
        messages: [`Superseded by a later submission on line ${csvLine(keptIndex ?? row.index)}`],
      });
  }
  return { kept, duplicates };
}

export function diffFields<T extends object>(
  current: { [K in keyof T]?: unknown },
  next: T,
  labels: { [K in keyof T]?: string },
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of Object.keys(labels) as Array<keyof T>) {
    const from = display(current[key]);
    const to = display(next[key]);
    if (from !== to) changes.push({ field: labels[key] ?? String(key), from, to });
  }
  return changes;
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}
