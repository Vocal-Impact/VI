import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/db/prisma";

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  diff?: Prisma.InputJsonValue;
}

type Db = Pick<typeof prisma, "auditLog">;

/** Records who did what. Pass a transaction client to keep the log atomic with the change. */
export async function writeAuditLog(entry: AuditEntry, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      diff: entry.diff,
    },
  });
}

export async function listAuditLog(filter: { entity?: string; entityId?: string; take?: number } = {}) {
  return prisma.auditLog.findMany({
    where: { entity: filter.entity, entityId: filter.entityId },
    orderBy: { createdAt: "desc" },
    take: filter.take ?? 50,
    include: { actor: { select: { name: true, email: true } } },
  });
}
