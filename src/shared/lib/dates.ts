/**
 * Date-only helpers. Calendar dates (birthdays, practice days) are handled as
 * ISO strings `YYYY-MM-DD` to avoid time-zone drift; the database stores them
 * in `DATE` columns, which Prisma represents as UTC-midnight `Date` objects.
 */

export type IsoDate = string; // YYYY-MM-DD

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** The calendar date at `now` in the given IANA time zone. */
export function localIsoDate(now: Date, timeZone: string): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Converts a `DATE` column value (UTC midnight) to an ISO date string. */
export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Converts an ISO date string to the UTC-midnight `Date` Prisma expects for `DATE` columns. */
export function fromIsoDate(value: IsoDate): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const date = fromIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Human format, e.g. "Fri, 3 Oct 2026". */
export function formatIsoDate(value: IsoDate, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(fromIsoDate(value));
}
