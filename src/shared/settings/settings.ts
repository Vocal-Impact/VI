import "server-only";
import { prisma } from "@/shared/db/prisma";
import { logger } from "@/shared/lib/logger";
import { err, ok, type Result } from "@/shared/lib/result";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { settingDefinitions, type AppSettings, type SettingKey, type SettingValue } from "./definitions";

const keys = Object.keys(settingDefinitions) as SettingKey[];

function parseStored<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const definition = settingDefinitions[key];
  const parsed = definition.schema.safeParse(raw);
  if (parsed.success) return parsed.data as SettingValue<K>;
  logger.warn("Invalid stored setting, using default", { key });
  return definition.defaultValue as SettingValue<K>;
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const entries = keys.map((key) => [
    key,
    stored.has(key) ? parseStored(key, stored.get(key)) : settingDefinitions[key].defaultValue,
  ]);
  return Object.fromEntries(entries) as AppSettings;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? parseStored(key, row.value) : (settingDefinitions[key].defaultValue as SettingValue<K>);
}

export async function updateSetting<K extends SettingKey>(
  key: K,
  value: unknown,
  actorId: string,
): Promise<Result<SettingValue<K>>> {
  const parsed = settingDefinitions[key].schema.safeParse(value);
  if (!parsed.success) {
    return err("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid value", {
      [key]: parsed.error.issues.map((issue) => issue.message),
    });
  }
  const json = parsed.data as never;
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key },
      create: { key, value: json, updatedById: actorId },
      update: { value: json, updatedById: actorId },
    });
    await writeAuditLog({ actorId, action: "setting.update", entity: "setting", entityId: key, diff: json }, tx);
  });
  return ok(parsed.data as SettingValue<K>);
}
