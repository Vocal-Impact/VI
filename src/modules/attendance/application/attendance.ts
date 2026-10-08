import "server-only";
import { reveal } from "@/shared/crypto/sensitive";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { todayLocal } from "@/shared/lib/clock";
import { toIsoDate } from "@/shared/lib/dates";
import { err, ok, type Result } from "@/shared/lib/result";
import { getSettings } from "@/shared/settings/settings";
import { toCsv } from "@/shared/lib/csv";
import { canUnmarkAttendance, hasStoppedComing, isEligibleForWhatsApp } from "../domain/eligibility";
import { canTakeAttendance, type RsvpResponse } from "../domain/practice";
import { attendanceToggleSchema } from "../schemas";

export interface ChecklistEntry {
  memberId: string;
  name: string;
  studentId: string;
  voiceType: string;
  status: string;
  attendedCount: number;
  present: boolean;
  /** What they said in advance, if anything. */
  rsvp: RsvpResponse | null;
}

/**
 * Everyone who could attend (prospective, active, inactive), with today's mark
 * and their total so far. Prospective members come first so new faces are
 * easy to find.
 */
export async function getAttendanceChecklist(practiceId: string): Promise<ChecklistEntry[]> {
  const members = await prisma.member.findMany({
    where: { deletedAt: null, status: { in: ["PROSPECTIVE", "ACTIVE", "INACTIVE"] } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      studentId: true,
      voiceType: true,
      status: true,
      _count: { select: { attendances: true } },
      attendances: { where: { practiceId }, select: { practiceId: true } },
      rsvps: { where: { practiceId }, select: { response: true } },
    },
  });
  const statusOrder: Record<string, number> = { PROSPECTIVE: 0, ACTIVE: 1, INACTIVE: 2 };
  return members
    .map((member) => ({
      memberId: member.id,
      name: `${member.firstName} ${member.lastName}`,
      studentId: member.studentId,
      voiceType: member.voiceType,
      status: member.status,
      attendedCount: member._count.attendances,
      present: member.attendances.length > 0,
      rsvp: member.rsvps[0]?.response ?? null,
    }))
    .sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
}

export async function setAttendance(
  raw: unknown,
  actor: { id: string; role: string },
): Promise<Result<{ attendedCount: number }>> {
  const parsed = attendanceToggleSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION", "Invalid attendance input");
  const { practiceId, memberId, present } = parsed.data;

  const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
  if (!practice) return err("NOT_FOUND", "Practice not found");
  if (practice.audience === "ALUMNI") return err("FORBIDDEN", "Attendance isn't taken at alumni practices");
  const practiceDate = toIsoDate(practice.date);
  if (!canTakeAttendance(actor.role, { date: practiceDate, status: practice.status }, todayLocal())) {
    return err(
      "FORBIDDEN",
      practice.status === "CANCELLED"
        ? "This practice was cancelled"
        : "Attendance can only be taken on the scheduled practice day",
    );
  }

  if (present) {
    await prisma.attendance.upsert({
      where: { practiceId_memberId: { practiceId, memberId } },
      create: { practiceId, memberId, markedById: actor.id },
      update: {},
    });
  } else {
    if (!canUnmarkAttendance(actor.role, practiceDate, todayLocal())) {
      return err("FORBIDDEN", "Only admins can change attendance after the practice day");
    }
    const removed = await prisma.attendance.deleteMany({ where: { practiceId, memberId } });
    if (removed.count > 0) {
      await writeAuditLog({
        actorId: actor.id,
        action: "attendance.unmark",
        entity: "member",
        entityId: memberId,
        diff: { practiceId },
      });
    }
  }

  const attendedCount = await prisma.attendance.count({ where: { memberId } });
  return ok({ attendedCount });
}

/** Prospective members who reached the threshold — the "Ready for WhatsApp" list. */
export async function listEligibleMembers() {
  const { attendanceThreshold } = await getSettings();
  const prospective = await prisma.member.findMany({
    where: { deletedAt: null, status: "PROSPECTIVE" },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: {
      _count: { select: { attendances: true } },
      invites: { select: { groupId: true, status: true, sentAt: true }, orderBy: { sentAt: "desc" } },
    },
  });
  return prospective
    .filter((member) => isEligibleForWhatsApp(member.status, member._count.attendances, attendanceThreshold))
    .map((member) => ({ ...member, attendedCount: member._count.attendances }));
}

/** Prospective members still working towards the threshold. */
export async function listProspectiveProgress() {
  const { attendanceThreshold } = await getSettings();
  const prospective = await prisma.member.findMany({
    where: { deletedAt: null, status: "PROSPECTIVE" },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: { _count: { select: { attendances: true } } },
  });
  return {
    threshold: attendanceThreshold,
    members: prospective
      .filter((member) => member._count.attendances < attendanceThreshold)
      .map((member) => ({ ...member, attendedCount: member._count.attendances })),
  };
}

/** Attended-practice counts per member, for gating invites in other modules. */
export async function getAttendedCounts(memberIds: string[]): Promise<Map<string, number>> {
  const groups = await prisma.attendance.groupBy({
    by: ["memberId"],
    where: { memberId: { in: memberIds } },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.memberId, group._count._all]));
}

export async function getAttendanceThreshold(): Promise<number> {
  return (await getSettings()).attendanceThreshold;
}

export async function getAttendanceReport() {
  const settings = await getSettings();
  const today = todayLocal();

  const [practices, activeMembers] = await Promise.all([
    prisma.practice.findMany({
      orderBy: { date: "desc" },
      take: 12,
      include: { _count: { select: { attendances: true } } },
    }),
    prisma.member.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: {
        _count: { select: { attendances: true } },
        attendances: {
          include: { practice: { select: { date: true } } },
          orderBy: { practice: { date: "desc" } },
          take: 1,
        },
      },
    }),
  ]);

  const stoppedComing = activeMembers
    .map((member) => {
      const last = member.attendances[0]?.practice.date;
      return {
        id: member.id,
        name: `${member.firstName} ${member.lastName}`,
        whatsappNumber: reveal(member.whatsappNumberEncrypted),
        lastAttended: last ? toIsoDate(last) : null,
        attendedCount: member._count.attendances,
        joined: toIsoDate(member.addedToWhatsappAt ?? member.createdAt),
      };
    })
    .filter((member) => hasStoppedComing(member.lastAttended, member.joined, today, settings.inactiveAfterWeeks));

  return {
    inactiveAfterWeeks: settings.inactiveAfterWeeks,
    practices: practices.map((practice) => ({
      id: practice.id,
      date: toIsoDate(practice.date),
      title: practice.title,
      attended: practice._count.attendances,
    })),
    stoppedComing,
  };
}

export async function exportAttendanceCsv(): Promise<string> {
  const rows = await prisma.attendance.findMany({
    include: { practice: true, member: { select: { firstName: true, lastName: true, studentId: true } } },
    orderBy: [{ practice: { date: "desc" } }, { member: { firstName: "asc" } }],
  });
  return toCsv(
    rows.map((row) => ({
      "Practice Date": toIsoDate(row.practice.date),
      Practice: row.practice.title,
      "First Name": row.member.firstName,
      "Last Name": row.member.lastName,
      "IIT Student ID": row.member.studentId,
      "Marked At": row.markedAt.toISOString(),
    })),
  );
}
