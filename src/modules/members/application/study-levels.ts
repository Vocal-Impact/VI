import "server-only";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { todayLocal } from "@/shared/lib/clock";
import type { IsoDate } from "@/shared/lib/dates";
import { STUDY_LEVELS } from "../domain/member";
import { academicYearOf, nextRolloverDate } from "../domain/study-year";

/** Internal setting: the academic year members' levels currently describe. */
const LEVELS_YEAR_KEY = "studyLevels.academicYear";

export interface RolloverSummary {
  /** Academic year the levels describe after this run. */
  academicYear: number;
  /** Times everyone moved up (0 when already up to date). */
  rollovers: number;
  promoted: number;
  graduated: number;
}

async function storedLevelsYear(): Promise<number | null> {
  const row = await prisma.setting.findUnique({ where: { key: LEVELS_YEAR_KEY } });
  return typeof row?.value === "number" ? row.value : null;
}

export async function getStudyYearStatus(today: IsoDate = todayLocal()) {
  const academicYear = (await storedLevelsYear()) ?? academicYearOf(today);
  return { academicYear, nextRollover: nextRolloverDate(academicYear) };
}

/**
 * Moves everyone up a level when a new academic year has started (1 September):
 * Foundation → L4 → L5 → Placement Year → L6 → alumni. Alumni are left alone.
 * Safe to call every day: it only acts once per academic year. The first call
 * just records the current academic year (the levels typed in are current).
 */
export async function runStudyYearRollover(today: IsoDate = todayLocal()): Promise<RolloverSummary> {
  const current = academicYearOf(today);
  const stored = await storedLevelsYear();
  if (stored === null) {
    await prisma.setting.upsert({
      where: { key: LEVELS_YEAR_KEY },
      create: { key: LEVELS_YEAR_KEY, value: current },
      update: { value: current },
    });
    return { academicYear: current, rollovers: 0, promoted: 0, graduated: 0 };
  }
  if (stored >= current) return { academicYear: stored, rollovers: 0, promoted: 0, graduated: 0 };

  const summary: RolloverSummary = { academicYear: current, rollovers: current - stored, promoted: 0, graduated: 0 };
  await prisma.$transaction(async (tx) => {
    for (let run = 0; run < summary.rollovers; run += 1) {
      // Finishing L6 → alumni (they keep L6 as their last level).
      const graduated = await tx.member.updateMany({
        where: { yearOfStudy: "L6", status: { not: "ALUMNI" } },
        data: { status: "ALUMNI" },
      });
      summary.graduated += graduated.count;
      // Highest level first, so nobody moves up twice in one run.
      for (let index = STUDY_LEVELS.length - 2; index >= 0; index -= 1) {
        const promoted = await tx.member.updateMany({
          where: { yearOfStudy: STUDY_LEVELS[index], status: { not: "ALUMNI" } },
          data: { yearOfStudy: STUDY_LEVELS[index + 1] },
        });
        summary.promoted += promoted.count;
      }
    }
    await tx.setting.update({ where: { key: LEVELS_YEAR_KEY }, data: { value: current } });
    await writeAuditLog(
      { actorId: null, action: "member.study-year-rollover", entity: "member", diff: { ...summary } },
      tx,
    );
  });
  return summary;
}
