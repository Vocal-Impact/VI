import "server-only";
import { brandLogoUrl, getEmailSender, venueRequestReminderEmail, type EmailSender } from "@/modules/notifications";
import { prisma } from "@/shared/db/prisma";
import { getEnv } from "@/shared/config/env";
import { todayLocal } from "@/shared/lib/clock";
import { addDays, formatIsoDate, fromIsoDate, toIsoDate, type IsoDate } from "@/shared/lib/dates";
import { errorMessage, logger } from "@/shared/lib/logger";
import { getSettings } from "@/shared/settings/settings";
import { formatTimeRange } from "../domain/practice";
import {
  gmailComposeUrl,
  isVenueReminderDue,
  renderVenueRequest,
  VENUE_REMINDER_DAYS_BEFORE,
  type VenueRequestDraft,
} from "../domain/venue-request";

const EXPECTED_STATUSES = ["PROSPECTIVE", "ACTIVE"] as const;

export interface VenueRequestLinks {
  draft: VenueRequestDraft;
  gmailUrl: string;
}

async function loadContext(practiceId: string) {
  const [practice, settings, expected] = await Promise.all([
    prisma.practice.findUnique({ where: { id: practiceId } }),
    getSettings(),
    prisma.member.count({ where: { deletedAt: null, status: { in: [...EXPECTED_STATUSES] } } }),
  ]);
  return practice ? { practice, template: settings.venueRequestTemplate, expected } : null;
}

function buildLinks(
  context: NonNullable<Awaited<ReturnType<typeof loadContext>>>,
  sender: { name: string; email: string },
): VenueRequestLinks {
  const { practice } = context;
  const draft = renderVenueRequest(context.template, {
    date: toIsoDate(practice.date),
    startTime: practice.startTime,
    endTime: practice.endTime,
    title: practice.title,
    venue: practice.venue,
    expected: context.expected,
    senderName: sender.name,
  });
  return { draft, gmailUrl: gmailComposeUrl(draft, sender.email) };
}

/** The ready-made venue request for one admin, for the button on the practice page. */
export async function getVenueRequestLinks(
  practiceId: string,
  sender: { name: string; email: string },
): Promise<VenueRequestLinks | null> {
  const context = await loadContext(practiceId);
  return context ? buildLinks(context, sender) : null;
}

export interface VenueReminderSummary {
  sent: number;
  failed: number;
}

/**
 * Emails every active admin the reminder to book a venue for one practice,
 * if it's due (two days before; straight away when the practice is sooner),
 * nobody has marked the request as sent, and it hasn't been sent already.
 * Safe to call any time: after scheduling, after an edit, and from the daily job.
 * The email's button opens the request, written from the template in Settings,
 * as a draft in the admin's own Gmail.
 */
export async function sendVenueRequestReminders(
  practiceId: string,
  options: { sender?: EmailSender; today?: IsoDate } = {},
): Promise<VenueReminderSummary> {
  const summary: VenueReminderSummary = { sent: 0, failed: 0 };
  const today = options.today ?? todayLocal();
  const context = await loadContext(practiceId);
  if (!context) return summary;
  const { practice } = context;
  if (!isVenueReminderDue({ ...practice, date: toIsoDate(practice.date) }, today)) return summary;

  // Claim it, so a double click, an edit and the daily job can't all send it.
  const claimed = await prisma.practice.updateMany({
    where: { id: practiceId, venueReminderSentAt: null, venueRequestedAt: null },
    data: { venueReminderSentAt: new Date() },
  });
  if (claimed.count === 0) return summary;

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { name: true, email: true },
  });
  const sender = options.sender ?? getEmailSender();
  const base = getEnv().BETTER_AUTH_URL.replace(/\/$/, "");
  const date = toIsoDate(context.practice.date);

  for (const admin of admins) {
    const links = buildLinks(context, admin);
    const log = await prisma.emailLog.create({
      data: {
        type: "VENUE_REQUEST",
        recipient: admin.email,
        sentForDate: context.practice.date,
        status: "PENDING",
      },
    });
    try {
      await sender.send(
        venueRequestReminderEmail({
          to: admin.email,
          adminName: admin.name.split(" ")[0] || admin.name,
          dateLabel: formatIsoDate(date),
          timeLabel: formatTimeRange(context.practice.startTime, context.practice.endTime),
          title: context.practice.title,
          draft: links.draft,
          gmailUrl: links.gmailUrl,
          practiceUrl: `${base}/attendance/${practiceId}`,
          settingsUrl: `${base}/settings`,
          logoUrl: brandLogoUrl(),
        }),
      );
      await prisma.emailLog.update({ where: { id: log.id }, data: { status: "SENT" } });
      summary.sent += 1;
    } catch (error) {
      const message = errorMessage(error);
      logger.warn("Venue request reminder failed", { practiceId, error: message });
      await prisma.emailLog.update({ where: { id: log.id }, data: { status: "FAILED", error: message.slice(0, 500) } });
      summary.failed += 1;
    }
  }
  if (summary.sent === 0 && summary.failed > 0) {
    await prisma.practice.update({ where: { id: practiceId }, data: { venueReminderSentAt: null } });
  }
  return summary;
}

/** Daily job: reminds the admins about every practice whose venue reminder is due today. */
export async function sendDueVenueRequestReminders(
  options: { sender?: EmailSender; today?: IsoDate } = {},
): Promise<VenueReminderSummary & { practices: number }> {
  const today = options.today ?? todayLocal();
  const due = await prisma.practice.findMany({
    where: {
      status: "SCHEDULED",
      venueRequestedAt: null,
      venueReminderSentAt: null,
      date: { gte: fromIsoDate(today), lte: fromIsoDate(addDays(today, VENUE_REMINDER_DAYS_BEFORE)) },
    },
    select: { id: true },
  });
  const total = { sent: 0, failed: 0, practices: 0 };
  for (const { id } of due) {
    const result = await sendVenueRequestReminders(id, { ...options, today });
    total.sent += result.sent;
    total.failed += result.failed;
    if (result.sent > 0) total.practices += 1;
  }
  return total;
}
