import "server-only";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import { groupInputSchema } from "../schemas";

export async function listGroups(options: { includeArchived?: boolean } = {}) {
  return prisma.whatsAppGroup.findMany({
    where: options.includeArchived ? undefined : { archived: false },
    orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { invites: true } } },
  });
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
