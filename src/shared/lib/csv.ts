import Papa from "papaparse";

/** Serialises rows to CSV (with a BOM so Excel opens UTF-8 correctly). */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  const csv = Papa.unparse(rows, { columns, newline: "\r\n" });
  return `﻿${csv}`;
}
