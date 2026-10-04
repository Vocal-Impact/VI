import type { IsoDate } from "@/shared/lib/dates";

/** Levels move up on this day every year (1 September). */
export const ROLLOVER_MONTH = 9;

/**
 * The academic year a date falls in, named by its starting year:
 * 2026-09-01 … 2027-08-31 → 2026.
 */
export function academicYearOf(date: IsoDate): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month >= ROLLOVER_MONTH ? year : year - 1;
}

/** "2026/27" */
export function formatAcademicYear(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}

/** The date of the next rollover after the academic year the levels describe. */
export function nextRolloverDate(levelsAcademicYear: number): IsoDate {
  return `${levelsAcademicYear + 1}-${String(ROLLOVER_MONTH).padStart(2, "0")}-01` as IsoDate;
}
