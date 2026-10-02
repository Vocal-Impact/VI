import "server-only";
import { prisma } from "@/shared/db/prisma";
import { todayLocal, systemClock, type Clock } from "@/shared/lib/clock";
import { formatIsoDate, fromIsoDate, type IsoDate } from "@/shared/lib/dates";
import { errorMessage, logger } from "@/shared/lib/logger";
import { birthdayDigestEmail, brandLogoUrl, getEmailSender, type EmailSender } from "@/modules/notifications";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { isBirthdayOn, turningAge } from "../domain/birthday";
import { listMembersWithBirthdays, type BirthdayMember } from "./birthdays";

export interface ReminderRunSummary {
  date: IsoDate;
  birthdays: number;
  recipients: number;
  emailsSent: number;
  emailsFailed: number;
  skippedAlreadySent: number;
}

const JOB_NAME = "birthday-reminders";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002"
  );
}

/**
 * Claims the (member, recipient, date) reminder so concurrent or repeated runs
 * never send twice. Returns true if this run should send it.
 */
async function claimReminder(memberId: string, recipient: string, date: IsoDate): Promise<boolean> {
  const sentForDate = fromIsoDate(date);
  try {
    await prisma.emailLog.create({
      data: { type: "BIRTHDAY_REMINDER", memberId, recipient, sentForDate, status: "PENDING" },
    });
    return true;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Retry only previously failed sends.
    const reclaimed = await prisma.emailLog.updateMany({
      where: { type: "BIRTHDAY_REMINDER", memberId, recipient, sentForDate, status: "FAILED" },
      data: { status: "PENDING", error: null },
    });
    return reclaimed.count === 1;
  }
}

/**
 * Daily job (Vercel Cron → /api/cron/birthdays): emails one digest of today's
 * birthdays to every active user who opted in. Idempotent per day.
 */
export async function sendBirthdayReminders(
  options: { clock?: Clock; sender?: EmailSender } = {},
): Promise<ReminderRunSummary> {
  const clock = options.clock ?? systemClock;
  const sender = options.sender ?? getEmailSender();
  const today = todayLocal(clock);
  const run = await prisma.cronRun.create({ data: { job: JOB_NAME } });

  const summary: ReminderRunSummary = {
    date: today,
    birthdays: 0,
    recipients: 0,
    emailsSent: 0,
    emailsFailed: 0,
    skippedAlreadySent: 0,
  };

  try {
    const celebrating = (await listMembersWithBirthdays()).filter((member) => isBirthdayOn(member.dateOfBirth, today));
    summary.birthdays = celebrating.length;

    const recipients =
      celebrating.length === 0
        ? []
        : await prisma.user.findMany({
            where: { active: true, receivesBirthdayReminders: true },
            select: { name: true, email: true },
          });
    summary.recipients = recipients.length;

    for (const recipient of recipients) {
      const claimed: BirthdayMember[] = [];
      for (const member of celebrating) {
        if (await claimReminder(member.id, recipient.email, today)) claimed.push(member);
        else summary.skippedAlreadySent += 1;
      }
      if (claimed.length === 0) continue;

      const where = {
        type: "BIRTHDAY_REMINDER" as const,
        recipient: recipient.email,
        sentForDate: fromIsoDate(today),
        memberId: { in: claimed.map((member) => member.id) },
      };
      try {
        await sender.send(
          birthdayDigestEmail(
            recipient.email,
            recipient.name,
            formatIsoDate(today),
            claimed.map((member) => ({
              name: member.name,
              voiceType: VOICE_TYPE_LABELS[member.voiceType as VoiceType] ?? member.voiceType,
              turningAge: turningAge(member.dateOfBirth, today),
              whatsappNumber: member.whatsappNumber,
            })),
            brandLogoUrl(),
          ),
        );
        await prisma.emailLog.updateMany({ where, data: { status: "SENT" } });
        summary.emailsSent += 1;
      } catch (error) {
        const message = errorMessage(error).slice(0, 500);
        logger.error("Birthday reminder failed", { recipient: recipient.email, error: message });
        await prisma.emailLog.updateMany({ where, data: { status: "FAILED", error: message } });
        summary.emailsFailed += 1;
      }
    }

    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        status: summary.emailsFailed > 0 ? "FAILED" : "SUCCESS",
        summary: { ...summary },
        finishedAt: new Date(),
      },
    });
    return summary;
  } catch (error) {
    await prisma.cronRun.update({
      where: { id: run.id },
      data: { status: "FAILED", summary: { ...summary, error: errorMessage(error) }, finishedAt: new Date() },
    });
    throw error;
  }
}

export async function listCronRuns(take = 30) {
  return prisma.cronRun.findMany({ orderBy: { startedAt: "desc" }, take });
}
