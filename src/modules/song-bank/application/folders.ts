import "server-only";
import { prisma } from "@/shared/db/prisma";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import { errorMessage, logger } from "@/shared/lib/logger";
import {
  canChangeFolder,
  canContribute,
  canDeleteFolder,
  canMoveFolderTo,
  descendantIds,
  folderLabel,
  folderPath,
  type FolderNode,
  type SongBankViewer,
} from "../domain/song-bank";
import type { FileStore } from "../domain/ports";
import { getFileStore } from "../infrastructure/file-store";
import { folderInputSchema } from "../schemas";

interface FolderRow extends FolderNode {
  createdById: string | null;
}

/** The whole folder tree (a choir has at most a few hundred folders). */
async function loadFolders(): Promise<Map<string, FolderRow>> {
  const rows = await prisma.songFolder.findMany({
    select: { id: true, name: true, parentId: true, createdById: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** Folders directly inside `parentId` (null = top level), with how much each holds. */
export async function listFolders(parentId: string | null) {
  const folders = await prisma.songFolder.findMany({
    where: { parentId },
    select: {
      id: true,
      name: true,
      createdById: true,
      updatedAt: true,
      _count: { select: { children: true, files: true } },
    },
  });
  return folders
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      createdById: folder.createdById,
      updatedAt: folder.updatedAt,
      folderCount: folder._count.children,
      fileCount: folder._count.files,
    }))
    .sort(byName);
}

/** A folder with the path to it, its subfolders and its files. Null when it doesn't exist. */
export async function getFolderView(id: string) {
  const folders = await loadFolders();
  const folder = folders.get(id);
  if (!folder) return null;
  const [subfolders, files] = await Promise.all([
    listFolders(id),
    prisma.songFile.findMany({
      where: { folderId: id },
      orderBy: { title: "asc" },
      select: {
        id: true,
        kind: true,
        title: true,
        voicePart: true,
        fileName: true,
        contentType: true,
        sizeBytes: true,
        linkUrl: true,
        uploadedById: true,
        createdAt: true,
        uploadedBy: { select: { name: true } },
      },
    }),
  ]);
  return { folder, path: folderPath(folders, id), subfolders, files };
}

/** Every folder as "2025 / Christmas concert / Silent Night", for "move to" pickers. */
export async function listFolderOptions(): Promise<Array<{ id: string; label: string; parentId: string | null }>> {
  const folders = await loadFolders();
  return [...folders.values()]
    .map((folder) => ({ id: folder.id, parentId: folder.parentId, label: folderLabel(folders, folder.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
}

/** Ids of every folder inside `id` (to leave out of its own "move to" picker). */
export async function listDescendantFolderIds(id: string): Promise<string[]> {
  return [...descendantIds((await loadFolders()).values(), id)];
}

/** Everything inside a folder at any depth: what deleting it would also delete. */
export async function countFolderContents(id: string): Promise<{ folders: number; files: number }> {
  const inside = descendantIds((await loadFolders()).values(), id);
  const files = await prisma.songFile.count({ where: { folderId: { in: [id, ...inside] } } });
  return { folders: inside.size, files };
}

async function nameTaken(name: string, parentId: string | null, excludeId?: string): Promise<boolean> {
  const existing = await prisma.songFolder.findFirst({
    where: { parentId, name: { equals: name, mode: "insensitive" }, id: excludeId ? { not: excludeId } : undefined },
    select: { id: true },
  });
  return existing !== null;
}

const NAME_TAKEN = { name: ["There's already a folder with this name here"] };

export async function createFolder(raw: unknown, viewer: SongBankViewer): Promise<Result<{ id: string }>> {
  if (!canContribute(viewer)) return err("FORBIDDEN", "Only admins, committee and section leads can add folders");
  const parsed = folderInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { name, parentId } = parsed.data;
  if (parentId && !(await prisma.songFolder.findUnique({ where: { id: parentId }, select: { id: true } }))) {
    return err("NOT_FOUND", "That folder no longer exists");
  }
  if (await nameTaken(name, parentId)) return err("CONFLICT", "Folder name already used", NAME_TAKEN);

  const folder = await prisma.$transaction(async (tx) => {
    const created = await tx.songFolder.create({ data: { name, parentId, createdById: viewer.id } });
    await writeAuditLog(
      {
        actorId: viewer.id,
        action: "songbank.folder.create",
        entity: "song_folder",
        entityId: created.id,
        diff: { name, parentId },
      },
      tx,
    );
    return created;
  });
  return ok({ id: folder.id });
}

/** Renames and/or moves a folder. */
export async function updateFolder(id: string, raw: unknown, viewer: SongBankViewer): Promise<Result<null>> {
  const parsed = folderInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { name, parentId } = parsed.data;
  const folders = await loadFolders();
  const current = folders.get(id);
  if (!current) return err("NOT_FOUND", "Folder not found");
  if (!canChangeFolder(viewer, current)) return err("FORBIDDEN", "You can only change folders you made");
  if (parentId && !folders.has(parentId)) return err("NOT_FOUND", "The folder to move it into no longer exists");
  if (!canMoveFolderTo(folders.values(), id, parentId)) {
    return err("VALIDATION", "A folder can't go inside itself", { parentId: ["Pick a folder outside this one"] });
  }
  if (await nameTaken(name, parentId, id)) return err("CONFLICT", "Folder name already used", NAME_TAKEN);

  await prisma.$transaction(async (tx) => {
    await tx.songFolder.update({ where: { id }, data: { name, parentId } });
    await writeAuditLog(
      {
        actorId: viewer.id,
        action: "songbank.folder.update",
        entity: "song_folder",
        entityId: id,
        diff: { from: { name: current.name, parentId: current.parentId }, to: { name, parentId } },
      },
      tx,
    );
  });
  return ok(null);
}

/**
 * Deletes a folder with every subfolder and file in it, then the uploaded files
 * from storage. Returns where the folder was, to go back there.
 */
export async function deleteFolder(
  id: string,
  viewer: SongBankViewer,
  store: FileStore | null = getFileStore(),
): Promise<Result<{ parentId: string | null; deletedFiles: number }>> {
  const folders = await loadFolders();
  const folder = folders.get(id);
  if (!folder) return err("NOT_FOUND", "Folder not found");
  const ids = [id, ...descendantIds(folders.values(), id)];
  const files = await prisma.songFile.findMany({ where: { folderId: { in: ids } }, select: { storageKey: true } });
  const isEmpty = ids.length === 1 && files.length === 0;
  if (!canDeleteFolder(viewer, folder, isEmpty)) {
    return err(
      "FORBIDDEN",
      isEmpty
        ? "You can only delete folders you made"
        : "Only admins and committee can delete a folder that isn't empty",
    );
  }

  await prisma.$transaction(async (tx) => {
    // Subfolders and files go with it (ON DELETE CASCADE).
    await tx.songFolder.delete({ where: { id } });
    await writeAuditLog(
      {
        actorId: viewer.id,
        action: "songbank.folder.delete",
        entity: "song_folder",
        entityId: id,
        diff: { name: folder.name, subfolders: ids.length - 1, files: files.length },
      },
      tx,
    );
  });
  await removeStoredFiles(
    files.map((file) => file.storageKey),
    store,
  );
  return ok({ parentId: folder.parentId, deletedFiles: files.length });
}

/** Best effort: a file left behind in storage costs a little space but breaks nothing. */
export async function removeStoredFiles(keys: Array<string | null>, store: FileStore | null): Promise<void> {
  if (!store) return;
  for (const key of keys) {
    if (!key) continue;
    try {
      await store.remove(key);
    } catch (error) {
      logger.warn("Song bank: could not delete a stored file", { key, error: errorMessage(error) });
    }
  }
}
