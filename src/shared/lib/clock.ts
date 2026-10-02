import { APP_TIMEZONE } from "@/shared/config/constants";
import { localIsoDate, type IsoDate } from "./dates";

/** Injectable source of "now" so time-dependent logic is testable. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Today's date in the choir's time zone (Asia/Colombo). */
export function todayLocal(clock: Clock = systemClock): IsoDate {
  return localIsoDate(clock.now(), APP_TIMEZONE);
}
