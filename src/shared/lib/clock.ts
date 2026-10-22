import { APP_TIMEZONE } from "@/shared/config/constants";
import { localIsoDate, localTime, type IsoDate } from "./dates";

/** Injectable source of "now" so time-dependent logic is testable. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Today's date in the choir's time zone (Asia/Colombo). */
export function todayLocal(clock: Clock = systemClock): IsoDate {
  return localIsoDate(clock.now(), APP_TIMEZONE);
}

/** The date and "HH:mm" time right now in the choir's time zone (to tell if a practice is on now). */
export interface LocalNow {
  date: IsoDate;
  time: string;
}

export function nowLocal(clock: Clock = systemClock): LocalNow {
  const now = clock.now();
  return { date: localIsoDate(now, APP_TIMEZONE), time: localTime(now, APP_TIMEZONE) };
}
