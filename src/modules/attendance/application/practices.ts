import "server-only";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { todayLocal } from "@/shared/lib/clock";
import { fromIsoDate, toIsoDate } from "@/shared/lib/dates";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import { practiceInputSchema } from "../schemas";

export async function listPractices(take = 30) {
  const practices = await prisma.practice.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
    include: { _count: { select: { attendances: true } } },
  });
  return practices.map((practice) => ({ ...practice, date: toIsoDate(practice.date) }));
}

export async function getPractice(id: string) {
  const practice = await prisma.practice.findUnique({ where: { id } });
  return practice ? { ...practice, date: toIsoDate(practice.date) } : null;
}

export async function getTodaysPractice() {
  const practice = await prisma.practice.findFirst({
    where: { date: fromIsoDate(todayLocal()) },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { attendances: true } } },
  });
  return practice ? { ...practice, date: toIsoDate(practice.date) } : null;
}

export async function createPractice(raw: unknown, actorId: string): Promise<Result<{ id: string }>> {
  const parsed = practiceInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const practice = await prisma.$transaction(async (tx) => {
    const created = await tx.practice.create({
      data: { date: fromIsoDate(parsed.data.date), title: parsed.data.title, venue: parsed.data.venue },
    });
    await writeAuditLog(
      { actorId, action: "practice.create", entity: "practice", entityId: created.id, diff: parsed.data },
      tx,
    );
    return created;
  });
  return ok({ id: practice.id });
}

/** One tap: reuses today's practice if it already exists. */
export async function startTodaysPractice(actorId: string): Promise<Result<{ id: string }>> {
  const existing = await getTodaysPractice();
  if (existing) return ok({ id: existing.id });
  return createPractice({ date: todayLocal(), title: "Practice" }, actorId);
}

export async function deletePractice(id: string, actorId: string): Promise<Result<null>> {
  const practice = await prisma.practice.findUnique({
    where: { id },
    include: { _count: { select: { attendances: true } } },
  });
  if (!practice) return err("NOT_FOUND", "Practice not found");
  await prisma.$transaction(async (tx) => {
    await tx.practice.delete({ where: { id } });
    await writeAuditLog(
      {
        actorId,
        action: "practice.delete",
        entity: "practice",
        entityId: id,
        diff: { date: toIsoDate(practice.date), attendances: practice._count.attendances },
      },
      tx,
    );
  });
  return ok(null);
}
