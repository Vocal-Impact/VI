import "server-only";
import { reveal } from "@/shared/crypto/sensitive";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { err, ok, type Result } from "@/shared/lib/result";
import { errorMessage, logger } from "@/shared/lib/logger";
import { getSettings } from "@/shared/settings/settings";
import { toCsv } from "@/shared/lib/csv";
import { validationError } from "@/shared/lib/validation";
import { getMembersByIds, markAddedToWhatsapp } from "@/modules/members";
import { getAttendedCounts } from "@/modules/attendance";
import { brandLogoUrl, getEmailSender, groupInviteEmail } from "@/modules/notifications";
import { hasPermission, type Role } from "@/modules/auth/domain";
import {
  buildWaMeUrl,
  canInviteToGroup,
  membershipStatus,
  type GroupMembershipStatus,
  renderInviteMessage,
  renderInviteParts,
} from "../domain/invite";
import { sendInvitesSchema } from "../schemas";

export interface InviteActor {
  id: string;
  role: Role;
}

/** Everything the "Send group invites" screen needs for the selected members. */
export async function getInviteContext(memberIds: string[]) {
  const [members, groups, counts, settings, invites] = await Promise.all([
    getMembersByIds(memberIds),
    prisma.whatsAppGroup.findMany({ where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    getAttendedCounts(memberIds),
    getSettings(),
    prisma.groupInvite.findMany({
      where: { memberId: { in: memberIds } },
      select: { memberId: true, groupId: true, status: true, sentAt: true },
    }),
  ]);

  return {
    threshold: settings.attendanceThreshold,
    template: settings.inviteMessageTemplate,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      inviteLink: group.inviteLink,
      requiresEligibility: group.requiresEligibility,
      isMainGroup: group.isMainGroup,
      allowedVoiceTypes: group.allowedVoiceTypes,
    })),
    members: members.map((member) => {
      const memberInvites = invites.filter((invite) => invite.memberId === member.id);
      return {
        ...member,
        attendedCount: counts.get(member.id) ?? 0,
        groupStatus: Object.fromEntries(groups.map((group) => [group.id, membershipStatus(memberInvites, group.id)])),
      };
    }),
  };
}

export interface SendInvitesResult {
  sent: number;
  failed: number;
  /** For WhatsApp / copy channels: the message to send (single member). */
  message?: string;
  waMeUrl?: string;
  failures: Array<{ memberName: string; error: string }>;
}

export async function sendInvites(raw: unknown, actor: InviteActor): Promise<Result<SendInvitesResult>> {
  const parsed = sendInvitesSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { memberIds, groupIds, channel, overrideEligibility } = parsed.data;

  if (channel !== "EMAIL" && memberIds.length > 1) {
    return err("VALIDATION", "WhatsApp and copy invites go to one member at a time. Use email for bulk invites.");
  }
  if (overrideEligibility && !hasPermission(actor.role, "invites:override-eligibility")) {
    return err("FORBIDDEN", "Only admins can override group restrictions");
  }

  const context = await getInviteContext(memberIds);
  const groups = context.groups.filter((group) => groupIds.includes(group.id));
  if (groups.length !== groupIds.length) return err("VALIDATION", "One of the selected groups no longer exists");
  if (context.members.length !== memberIds.length) return err("NOT_FOUND", "One of the selected members was not found");

  // Gate every (member, group) pair before sending anything.
  const blocked: string[] = [];
  let overridden = false;
  for (const member of context.members) {
    for (const group of groups) {
      const decision = canInviteToGroup(member, group, context.threshold, overrideEligibility);
      if (!decision.allowed) blocked.push(`${member.firstName} ${member.lastName} → ${group.name}: ${decision.reason}`);
      else if (decision.overridden) overridden = true;
    }
  }
  if (blocked.length > 0) return err("FORBIDDEN", `Can't be invited:\n${blocked.join("\n")}`);

  const result: SendInvitesResult = { sent: 0, failed: 0, failures: [] };
  const sender = getEmailSender();

  for (const member of context.members) {
    const message = renderInviteMessage(context.template, member, groups);
    let status: "SENT" | "FAILED" = "SENT";
    let error: string | null = null;

    if (channel === "EMAIL") {
      try {
        await sender.send(
          groupInviteEmail({
            to: member.email,
            firstName: member.firstName,
            text: message,
            ...renderInviteParts(context.template, member),
            groups: groups.map((group) => ({
              name: group.name,
              inviteLink: group.inviteLink,
              description: group.description,
              isMainGroup: group.isMainGroup,
            })),
            logoUrl: brandLogoUrl(),
          }),
        );
      } catch (sendError) {
        status = "FAILED";
        error = errorMessage(sendError).slice(0, 500);
        logger.error("Invite email failed", { memberId: member.id, error });
        result.failures.push({ memberName: `${member.firstName} ${member.lastName}`, error });
      }
      await prisma.emailLog.create({
        data: { type: "GROUP_INVITE", memberId: member.id, recipient: member.email, status, error },
      });
    } else {
      result.message = message;
      if (channel === "WHATSAPP_LINK") result.waMeUrl = buildWaMeUrl(member.whatsappNumber, message);
    }

    await prisma.groupInvite.createMany({
      data: groups.map((group) => ({
        memberId: member.id,
        groupId: group.id,
        sentById: actor.id,
        channel,
        status,
        error,
      })),
    });
    if (status === "SENT") result.sent += 1;
    else result.failed += 1;
  }

  if (overridden) {
    await writeAuditLog({
      actorId: actor.id,
      action: "invite.override-eligibility",
      entity: "group_invite",
      diff: { memberIds, groupIds: groups.map((group) => group.id) },
    });
  }
  return ok(result);
}

/**
 * Records that a member is now in a group (seen in WhatsApp). Joining a main
 * group makes the member ACTIVE.
 */
export async function markInviteJoined(memberId: string, groupId: string, actor: InviteActor): Promise<Result<null>> {
  const group = await prisma.whatsAppGroup.findUnique({ where: { id: groupId } });
  if (!group) return err("NOT_FOUND", "Group not found");
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return err("NOT_FOUND", "Member not found");

  await prisma.$transaction(async (tx) => {
    const updated = await tx.groupInvite.updateMany({
      where: { memberId, groupId, status: { not: "JOINED" } },
      data: { status: "JOINED", joinedAt: new Date() },
    });
    const alreadyJoined = await tx.groupInvite.count({ where: { memberId, groupId, status: "JOINED" } });
    if (updated.count === 0 && alreadyJoined === 0) {
      await tx.groupInvite.create({
        data: { memberId, groupId, sentById: actor.id, channel: "MANUAL", status: "JOINED", joinedAt: new Date() },
      });
    }
    await writeAuditLog(
      { actorId: actor.id, action: "invite.joined", entity: "member", entityId: memberId, diff: { group: group.name } },
      tx,
    );
    if (group.isMainGroup) await markAddedToWhatsapp(memberId, actor.id, tx);
  });
  return ok(null);
}

export async function listInviteHistory(take = 50) {
  return prisma.groupInvite.findMany({
    orderBy: { sentAt: "desc" },
    take,
    include: {
      member: { select: { id: true, firstName: true, lastName: true } },
      group: { select: { name: true } },
      sentBy: { select: { name: true } },
    },
  });
}

/** Members who were sent invites but have not been marked joined for at least one group. */
export async function countPendingInvites(): Promise<number> {
  const pending = await prisma.groupInvite.findMany({
    where: { status: "SENT", member: { deletedAt: null } },
    select: { memberId: true, groupId: true },
    distinct: ["memberId", "groupId"],
  });
  const joined = await prisma.groupInvite.findMany({
    where: { status: "JOINED" },
    select: { memberId: true, groupId: true },
  });
  const joinedKeys = new Set(joined.map((invite) => `${invite.memberId}:${invite.groupId}`));
  return new Set(
    pending
      .filter((invite) => !joinedKeys.has(`${invite.memberId}:${invite.groupId}`))
      .map((invite) => invite.memberId),
  ).size;
}

export async function exportInvitesCsv(): Promise<string> {
  const invites = await prisma.groupInvite.findMany({
    orderBy: { sentAt: "desc" },
    include: {
      member: { select: { firstName: true, lastName: true, studentId: true } },
      group: { select: { name: true } },
      sentBy: { select: { name: true } },
    },
  });
  return toCsv(
    invites.map((invite) => ({
      "First Name": invite.member.firstName,
      "Last Name": invite.member.lastName,
      "IIT Student ID": invite.member.studentId,
      Group: invite.group.name,
      Channel: invite.channel,
      Status: invite.status,
      "Sent At": invite.sentAt.toISOString(),
      "Joined At": invite.joinedAt?.toISOString() ?? "",
      "Sent By": invite.sentBy?.name ?? "",
    })),
  );
}

// ─── Group roster ──────────────────────────────────────────────────────

/** Members who can be in WhatsApp groups (not alumni, not removed). */
const ROSTER_STATUSES = ["PROSPECTIVE", "ACTIVE", "INACTIVE"] as const;

export interface RosterRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  whatsappNumber: string;
  voiceType: string;
  status: string;
  attendedCount: number;
  membership: GroupMembershipStatus;
  lastInvitedAt: Date | null;
  joinedAt: Date | null;
  /** Can be invited without an admin override, and why not if not. */
  eligible: boolean;
  reason: string | null;
}

/**
 * Everyone who could be in a group, split into "in the group" and "to invite",
 * ordered: active members not in the group → eligible people not yet invited →
 * people invited but not joined yet → people who can't join yet (greyed out).
 */
export async function getGroupRoster(groupId: string) {
  const group = await prisma.whatsAppGroup.findUnique({ where: { id: groupId } });
  if (!group) return null;
  const [settings, members, invites] = await Promise.all([
    getSettings(),
    prisma.member.findMany({
      where: { deletedAt: null, status: { in: [...ROSTER_STATUSES] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        whatsappNumberEncrypted: true,
        voiceType: true,
        status: true,
        _count: { select: { attendances: true } },
      },
    }),
    prisma.groupInvite.findMany({
      where: { groupId },
      select: { memberId: true, groupId: true, status: true, sentAt: true, joinedAt: true },
    }),
  ]);

  const rows: RosterRow[] = members.map((member) => {
    const mine = invites.filter((invite) => invite.memberId === member.id);
    const decision = canInviteToGroup(
      { status: member.status, attendedCount: member._count.attendances, voiceType: member.voiceType },
      group,
      settings.attendanceThreshold,
    );
    const successful = mine.filter((invite) => invite.status !== "FAILED");
    return {
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      whatsappNumber: reveal(member.whatsappNumberEncrypted),
      voiceType: member.voiceType,
      status: member.status,
      attendedCount: member._count.attendances,
      membership: membershipStatus(mine, groupId),
      lastInvitedAt: successful.length ? new Date(Math.max(...successful.map((i) => i.sentAt.getTime()))) : null,
      joinedAt: mine.find((invite) => invite.status === "JOINED")?.joinedAt ?? null,
      eligible: decision.allowed,
      reason: decision.allowed ? null : decision.reason,
    };
  });

  const notInvited = (row: RosterRow) => row.membership === "NOT_INVITED" || row.membership === "FAILED";
  const rank = (row: RosterRow) => {
    if (!row.eligible) return 3;
    if (row.status === "ACTIVE") return 0; // active members missing from the group come first
    return notInvited(row) ? 1 : 2;
  };
  const toInvite = rows.filter((row) => row.membership !== "JOINED").sort((a, b) => rank(a) - rank(b));
  const inGroup = rows
    .filter((row) => row.membership === "JOINED")
    .sort((a, b) => (b.joinedAt?.getTime() ?? 0) - (a.joinedAt?.getTime() ?? 0));

  return {
    group,
    threshold: settings.attendanceThreshold,
    toInvite,
    inGroup,
    stats: {
      invitedPeople: rows.filter((row) => row.lastInvitedAt !== null).length,
      joinedPeople: inGroup.length,
    },
  };
}

// ─── Ready for WhatsApp ────────────────────────────────────────────────

export type WhatsAppQueueKind = "ACTIVE_NOT_IN_GROUP" | "READY" | "STILL_ATTENDING";

/**
 * The "Ready for WhatsApp" list, in this order:
 *  1. active members not yet marked as in the main group(s),
 *  2. prospective members who reached the practice threshold (not invited first),
 *  3. prospective members still working towards it.
 * "Main group(s)" = groups flagged main; if none is set up, any group counts.
 */
export async function listWhatsAppQueue() {
  const [settings, groups, members] = await Promise.all([
    getSettings(),
    prisma.whatsAppGroup.findMany({ where: { archived: false }, select: { id: true, isMainGroup: true } }),
    prisma.member.findMany({
      where: { deletedAt: null, status: { in: ["PROSPECTIVE", "ACTIVE"] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: {
        _count: { select: { attendances: true } },
        invites: {
          where: { status: { in: ["SENT", "JOINED"] } },
          select: { groupId: true, status: true, sentAt: true },
          orderBy: { sentAt: "desc" },
        },
      },
    }),
  ]);
  const mainIds = new Set(groups.filter((group) => group.isMainGroup).map((group) => group.id));
  const counts = (groupId: string) => (mainIds.size ? mainIds.has(groupId) : true);

  const rows = members.flatMap((member) => {
    const relevant = member.invites.filter((invite) => counts(invite.groupId));
    const joined = relevant.some((invite) => invite.status === "JOINED");
    const attendedCount = member._count.attendances;
    const kind: WhatsAppQueueKind =
      member.status === "ACTIVE"
        ? "ACTIVE_NOT_IN_GROUP"
        : attendedCount >= settings.attendanceThreshold
          ? "READY"
          : "STILL_ATTENDING";
    // Active members already in the main group are done; nothing to show.
    if (member.status === "ACTIVE" && (joined || groups.length === 0)) return [];
    return [
      {
        id: member.id,
        name: `${member.firstName} ${member.lastName}`,
        status: member.status,
        voiceType: member.voiceType,
        whatsappNumber: reveal(member.whatsappNumberEncrypted),
        attendedCount,
        kind,
        invitedAt: relevant[0]?.sentAt ?? null,
      },
    ];
  });

  const rank = (row: (typeof rows)[number]) =>
    row.kind === "ACTIVE_NOT_IN_GROUP" ? 0 : row.kind === "READY" ? (row.invitedAt ? 2 : 1) : 3;
  return { threshold: settings.attendanceThreshold, rows: rows.sort((a, b) => rank(a) - rank(b)) };
}
