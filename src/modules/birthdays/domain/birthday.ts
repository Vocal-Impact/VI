import { fromIsoDate, isLeapYear, type IsoDate } from "@/shared/lib/dates";

/**
 * Birthday maths on calendar dates (blueprint §5.4). All inputs are ISO
 * dates already resolved in Asia/Colombo, so no time-zone logic lives here.
 */

/** The date a birthday is celebrated in `year`. 29 Feb → 28 Feb in non-leap years. */
export function birthdayInYear(dateOfBirth: IsoDate, year: number): IsoDate {
  const monthDay = dateOfBirth.slice(5);
  if (monthDay === "02-29" && !isLeapYear(year)) return `${year}-02-28`;
  return `${year}-${monthDay}`;
}

export function isBirthdayOn(dateOfBirth: IsoDate, date: IsoDate): boolean {
  return birthdayInYear(dateOfBirth, Number(date.slice(0, 4))) === date;
}

export function nextBirthday(dateOfBirth: IsoDate, today: IsoDate): IsoDate {
  const year = Number(today.slice(0, 4));
  const thisYear = birthdayInYear(dateOfBirth, year);
  return thisYear >= today ? thisYear : birthdayInYear(dateOfBirth, year + 1);
}

const DAY_MS = 86_400_000;

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / DAY_MS);
}

export function daysUntilBirthday(dateOfBirth: IsoDate, today: IsoDate): number {
  return daysBetween(today, nextBirthday(dateOfBirth, today));
}

/** Age reached on the celebrated birthday in `onDate`'s year. */
export function turningAge(dateOfBirth: IsoDate, onDate: IsoDate): number {
  return Number(onDate.slice(0, 4)) - Number(dateOfBirth.slice(0, 4));
}

export interface PersonWithBirthday {
  dateOfBirth: IsoDate;
}

export interface UpcomingBirthday<T> {
  person: T;
  date: IsoDate;
  daysUntil: number;
  turningAge: number;
}

/** Birthdays from `today` up to and including `today + days`, soonest first. */
export function upcomingBirthdays<T extends PersonWithBirthday>(
  people: readonly T[],
  today: IsoDate,
  days: number,
): UpcomingBirthday<T>[] {
  return people
    .map((person) => {
      const date = nextBirthday(person.dateOfBirth, today);
      return { person, date, daysUntil: daysBetween(today, date), turningAge: turningAge(person.dateOfBirth, date) };
    })
    .filter((entry) => entry.daysUntil <= days)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Birthdays celebrated in a given month (1–12) of a year, by day. */
export function birthdaysInMonth<T extends PersonWithBirthday>(
  people: readonly T[],
  year: number,
  month: number,
): Array<{ person: T; date: IsoDate; turningAge: number }> {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return people
    .map((person) => {
      const date = birthdayInYear(person.dateOfBirth, year);
      return { person, date, turningAge: turningAge(person.dateOfBirth, date) };
    })
    .filter((entry) => entry.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date));
}
