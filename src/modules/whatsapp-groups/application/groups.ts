import "server-only";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import { groupInputSchema } from "../schemas";

export interface GroupStats {
  /** Distinct people who were successfully sent an invite (failed sends and repeats don't count). */
  invitedPeople: number;
  /** Distinct people marked as in the group. */
  joinedPeople: number;
}

/** Per-group people counts. Removed members are left out. */
export async function getGroupStats(groupIds?: string[]): Promise<Map<string, GroupStats>> {
  const invites = await prisma.groupInvite.findMany({
    where: {
      groupId: groupIds ? { in: groupIds } : undefined,
      status: { in: ["SENT", "JOINED"] },
      member: { deletedAt: null },
    },
    select: { groupId: true, memberId: true, status: true },
  });
  const invited = new Map<string, Set<string>>();
  const joined = new Map<string, Set<string>>();
  for (const invite of invites) {
    if (!invited.has(invite.groupId)) invited.set(invite.groupId, new Set());
    invited.get(invite.groupId)!.add(invite.memberId);
    if (invite.status === "JOINED") {
      if (!joined.has(invite.groupId)) joined.set(invite.groupId, new Set());
      joined.get(invite.groupId)!.add(invite.memberId);
    }
  }
  const stats = new Map<string, GroupStats>();
  for (const id of new Set([...invited.keys(), ...(groupIds ?? [])])) {
    stats.set(id, { invitedPeople: invited.get(id)?.size ?? 0, joinedPeople: joined.get(id)?.size ?? 0 });
  }
  return stats;
}

export async function listGroups(options: { includeArchived?: boolean } = {}) {
  const groups = await prisma.whatsAppGroup.findMany({
    where: options.includeArchived ? undefined : { archived: false },
    orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  const stats = await getGroupStats(groups.map((group) => group.id));
  return groups.map((group) => ({
    ...group,
    stats: stats.get(group.id) ?? { invitedPeople: 0, joinedPeople: 0 },
  }));
}

export async function getGroup(id: string) {
  return prisma.whatsAppGroup.findUnique({ where: { id } });
}

async function nameTaken(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.whatsAppGroup.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, id: excludeId ? { not: excludeId } : undefined },
  });
  return existing !== null;
}

export async function createGroup(raw: unknown, actorId: string): Promise<Result<{ id: string }>> {
  const parsed = groupInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  if (await nameTaken(parsed.data.name))
    return err("CONFLICT", "A group with this name exists", { name: ["Name already used"] });

  const last = await prisma.whatsAppGroup.aggregate({ _max: { sortOrder: true } });
  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.whatsAppGroup.create({
      data: { ...parsed.data, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    // The invite link itself is sensitive and deliberately not written to the audit log.
    await writeAuditLog(
      { actorId, action: "group.create", entity: "whatsapp_group", entityId: created.id, diff: { name: created.name } },
      tx,
    );
    return created;
  });
  return ok({ id: group.id });
}

export async function updateGroup(id: string, raw: unknown, actorId: string): Promise<Result<null>> {
  const parsed = groupInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const current = await prisma.whatsAppGroup.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "Group not found");
  if (await nameTaken(parsed.data.name, id))
    return err("CONFLICT", "A group with this name exists", { name: ["Name already used"] });

  await prisma.$transaction(async (tx) => {
    await tx.whatsAppGroup.update({ where: { id }, data: parsed.data });
    await writeAuditLog(
      {
        actorId,
        action: "group.update",
        entity: "whatsapp_group",
        entityId: id,
        diff: {
          name: parsed.data.name,
          linkChanged: current.inviteLink !== parsed.data.inviteLink,
          requiresEligibility: parsed.data.requiresEligibility,
          isMainGroup: parsed.data.isMainGroup,
          allowedVoiceTypes: parsed.data.allowedVoiceTypes,
        },
      },
      tx,
    );
  });
  return ok(null);
}

export async function setGroupArchived(id: string, archived: boolean, actorId: string): Promise<Result<null>> {
  const current = await prisma.whatsAppGroup.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "Group not found");
  await prisma.$transaction(async (tx) => {
    await tx.whatsAppGroup.update({ where: { id }, data: { archived } });
    await writeAuditLog(
      { actorId, action: archived ? "group.archive" : "group.restore", entity: "whatsapp_group", entityId: id },
      tx,
    );
  });
  return ok(null);
}

/** Swaps a group with its neighbour in the display order. */
export async function moveGroup(id: string, direction: "up" | "down"): Promise<Result<null>> {
  const groups = await prisma.whatsAppGroup.findMany({
    where: { archived: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const index = groups.findIndex((group) => group.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= groups.length) return ok(null);

  const reordered = [...groups];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith]!, reordered[index]!];
  await prisma.$transaction(
    reordered.map((group, position) =>
      prisma.whatsAppGroup.update({ where: { id: group.id }, data: { sortOrder: position + 1 } }),
    ),
  );
  return ok(null);
}
