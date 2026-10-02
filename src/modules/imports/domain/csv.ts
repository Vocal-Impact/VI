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
