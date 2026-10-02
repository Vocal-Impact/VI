import "server-only";
import { prisma } from "@/shared/db/prisma";
import { todayLocal, type Clock, systemClock } from "@/shared/lib/clock";
import { toIsoDate, type IsoDate } from "@/shared/lib/dates";
import { birthdaysInMonth, upcomingBirthdays } from "../domain/birthday";

export interface BirthdayMember {
  id: string;
  name: string;
  voiceType: string;
  whatsappNumber: string;
  dateOfBirth: IsoDate;
}

/** Current members (not alumni, not removed) who have a birthday on file. */
export async function listMembersWithBirthdays(): Promise<BirthdayMember[]> {
  const members = await prisma.member.findMany({
    where: { deletedAt: null, status: { in: ["PROSPECTIVE", "ACTIVE", "INACTIVE"] }, dateOfBirth: { not: null } },
    select: { id: true, firstName: true, lastName: true, voiceType: true, whatsappNumber: true, dateOfBirth: true },
  });
  return members.map((member) => ({
    id: member.id,
    name: `${member.firstName} ${member.lastName}`,
    voiceType: member.voiceType,
    whatsappNumber: member.whatsappNumber,
    dateOfBirth: toIsoDate(member.dateOfBirth as Date),
  }));
}

export async function getBirthdayDashboard(clock: Clock = systemClock) {
  const today = todayLocal(clock);
  const people = await listMembersWithBirthdays();
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const upcoming = upcomingBirthdays(people, today, 7);
  const missing = await prisma.member.count({
    where: { deletedAt: null, status: { in: ["PROSPECTIVE", "ACTIVE"] }, dateOfBirth: null },
  });
  return {
    today,
    todays: upcoming.filter((entry) => entry.daysUntil === 0),
    nextSevenDays: upcoming.filter((entry) => entry.daysUntil > 0),
    thisMonth: birthdaysInMonth(people, year, month),
    missing,
  };
}

export async function getBirthdayCalendar(year: number, month: number) {
  const people = await listMembersWithBirthdays();
  return birthdaysInMonth(people, year, month);
}
