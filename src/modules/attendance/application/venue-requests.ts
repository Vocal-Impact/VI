import "server-only";
import { brandLogoUrl, getEmailSender, venueRequestReminderEmail, type EmailSender } from "@/modules/notifications";
import { prisma } from "@/shared/db/prisma";
import { getEnv } from "@/shared/config/env";
import { formatIsoDate, toIsoDate } from "@/shared/lib/dates";
import { errorMessage, logger } from "@/shared/lib/logger";
import { getSettings } from "@/shared/settings/settings";
import { formatTimeRange } from "../domain/practice";
import { gmailComposeUrl, mailtoUrl, renderVenueRequest, type VenueRequestDraft } from "../domain/venue-request";

const EXPECTED_STATUSES = ["PROSPECTIVE", "ACTIVE"] as const;

export interface VenueRequestLinks {
  draft: VenueRequestDraft;
  gmailUrl: string;
  mailtoUrl: string;
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
  return { draft, gmailUrl: gmailComposeUrl(draft, sender.email), mailtoUrl: mailtoUrl(draft) };
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
 * After a practice is scheduled, emails every active admin a reminder to book
 * a venue with the IIT administration. The email's button opens the request,
 * already written from the template in Settings, as a draft in their Gmail.
 */
export async function sendVenueRequestReminders(
  practiceId: string,
  options: { sender?: EmailSender } = {},
): Promise<VenueReminderSummary> {
  const summary: VenueReminderSummary = { sent: 0, failed: 0 };
  const context = await loadContext(practiceId);
  if (!context || context.practice.status === "CANCELLED") return summary;

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
          mailtoUrl: links.mailtoUrl,
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
  return summary;
}
