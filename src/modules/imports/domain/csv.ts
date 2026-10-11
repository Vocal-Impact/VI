import Papa from "papaparse";

export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
  errors: string[];
}

export const MAX_CSV_BYTES = 1024 * 1024;

/** Parses a Google Sheets/Forms CSV export (handles BOM, quotes and CRLF). */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    errors: result.errors.map((error) => `Row ${(error.row ?? 0) + 2}: ${error.message}`),
  };
}

/** Case/punctuation-insensitive header key: "What is your voice type?" → "whatisyourvoicetype". */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ColumnSpec<F extends string> {
  field: F;
  /** Accepted header texts, most specific first. */
  headers: readonly string[];
  required: boolean;
}

/**
 * Maps profile fields to the actual CSV header names. Each CSV column is used
 * at most once, so "IIT Email Address" wins over a generic "Email Address".
 * Exact matches come first; then a header that *starts with* an alias also
 * counts, for Google Form questions with extra explanation in the title
 * ("Location (Nearest Landmark). This is to help us organise carpooling…").
 */
export function resolveColumns<F extends string>(
  csvHeaders: readonly string[],
  specs: readonly ColumnSpec<F>[],
): { columns: Partial<Record<F, string>>; missing: string[] } {
  const byKey = new Map(csvHeaders.map((header) => [normalizeHeader(header), header]));
  const used = new Set<string>();
  const columns: Partial<Record<F, string>> = {};
  const missing: string[] = [];

  for (const spec of specs) {
    const match = spec.headers.map((alias) => byKey.get(normalizeHeader(alias))).find((h) => h && !used.has(h));
    if (match) {
      columns[spec.field] = match;
      used.add(match);
    }
  }
  for (const spec of specs) {
    if (columns[spec.field]) continue;
    const match = spec.headers
      .map(normalizeHeader)
      .filter((alias) => alias.length >= 5)
      .map((alias) => csvHeaders.find((header) => !used.has(header) && normalizeHeader(header).startsWith(alias)))
      .find(Boolean);
    if (match) {
      columns[spec.field] = match;
      used.add(match);
    } else if (spec.required) {
      missing.push(spec.headers[0] ?? spec.field);
    }
  }
  return { columns, missing };
}

export function parseYesNo(raw: string | undefined): boolean | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (
    ["yes", "y", "true", "1"].some(
      (word) => value === word || value.startsWith(`${word} `) || value.startsWith(`${word},`),
    )
  )
    return true;
  if (
    ["no", "n", "false", "0"].some(
      (word) => value === word || value.startsWith(`${word} `) || value.startsWith(`${word},`),
    )
  )
    return false;
  return null;
}

export type DateOrder = "DMY" | "MDY";
/** How the user asked dates to be read: worked out from the file, or set by hand. */
export type DateOrderChoice = "AUTO" | DateOrder;

/**
 * Day-first (15/03/2004) or month-first (03/15/2004)? Counts dates that can
 * only be read one way (a first part over 12 means day-first, a second part
 * over 12 means month-first). Null when nothing settles it.
 */
export function detectDateOrder(values: readonly string[]): DateOrder | null {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const value of values) {
    const match = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(value);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12 && second <= 12) dayFirst += 1;
    else if (second > 12 && first <= 12) monthFirst += 1;
  }
  if (dayFirst === monthFirst) return null;
  return dayFirst > monthFirst ? "DMY" : "MDY";
}

export interface DateFormatUsed {
  order: DateOrder;
  /** Why: chosen on the import page, worked out from the birth dates or Google's Timestamp column, or the default. */
  source: "chosen" | "birth dates" | "timestamps" | "default";
}

/**
 * The date order for a file: the user's choice, else the birth dates
 * themselves, else Google Forms' Timestamp column (written in the same
 * format as date answers), else day-first.
 */
export function resolveDateOrder(
  csv: ParsedCsv,
  dateHeader: string | undefined,
  choice: DateOrderChoice = "AUTO",
): DateFormatUsed {
  if (choice !== "AUTO") return { order: choice, source: "chosen" };
  const fromDates = dateHeader ? detectDateOrder(csv.rows.map((row) => row[dateHeader] ?? "")) : null;
  if (fromDates) return { order: fromDates, source: "birth dates" };
  const timestampHeader = csv.headers.find((header) => normalizeHeader(header) === "timestamp");
  const fromTimestamps = timestampHeader ? detectDateOrder(csv.rows.map((row) => row[timestampHeader] ?? "")) : null;
  if (fromTimestamps) return { order: fromTimestamps, source: "timestamps" };
  return { order: "DMY", source: "default" };
}
