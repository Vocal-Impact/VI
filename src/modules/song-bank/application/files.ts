import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/shared/db/prisma";
import { getEnv } from "@/shared/config/env";
import { writeAuditLog } from "@/shared/audit/audit-log";
import { signToken, verifyToken } from "@/shared/crypto/signed-token";
import { err, ok, type Result } from "@/shared/lib/result";
import { validationError } from "@/shared/lib/validation";
import {
  canChangeFile,
  canContribute,
  folderPath,
  formatBytes,
  MAX_UPLOAD_BYTES,
  storageKeyFor,
  uploadTypeOf,
  type SongBankViewer,
} from "../domain/song-bank";
import type { FileStore } from "../domain/ports";
import { getFileStore } from "../infrastructure/file-store";
import { fileUpdateSchema, finishUploadSchema, linkInputSchema, startUploadSchema } from "../schemas";
import { removeStoredFiles } from "./folders";

/** How long someone has to finish an upload after starting it. */
const TICKET_MS = 60 * 60 * 1000;

/** Whether files can be uploaded here (R2 configured, or local development). */
export function isUploadAvailable(): boolean {
  return getFileStore() !== null;
}

/**
 * What a started upload is allowed to become. Signed, so the browser can't
 * swap in another file's storage key or folder when it finishes the upload.
 */
const ticketSchema = z.object({
  key: z.string(),
  folderId: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  kind: z.enum(["AUDIO", "PDF"]),
  userId: z.string(),
  exp: z.number(),
});

/**
 * Step 1 of an upload: checks the file and returns a signed link the browser
 * uploads it to directly, plus a ticket for step 2.
 */
export async function startUpload(
  raw: unknown,
  viewer: SongBankViewer,
  store: FileStore | null = getFileStore(),
  now: () => number = Date.now,
): Promise<Result<{ uploadUrl: string; ticket: string; contentType: string }>> {
  if (!canContribute(viewer)) return err("FORBIDDEN", "Only admins, committee and section leads can upload");
  if (!store) return err("EXTERNAL", "File uploads aren't set up yet. Ask an admin, or add a link instead.");
  const parsed = startUploadSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { folderId, fileName, sizeBytes } = parsed.data;

  const type = uploadTypeOf(fileName);
  if (!type) return err("VALIDATION", `${fileName}: upload an audio file (MP3, M4A, WAV, OGG/Opus…) or a PDF`);
  if (sizeBytes > MAX_UPLOAD_BYTES[type.kind]) {
    return err("VALIDATION", `${fileName} is too big (the limit is ${formatBytes(MAX_UPLOAD_BYTES[type.kind])})`);
  }
  if (!(await prisma.songFolder.findUnique({ where: { id: folderId }, select: { id: true } }))) {
    return err("NOT_FOUND", "That folder no longer exists");
  }

  const key = storageKeyFor(randomUUID(), fileName);
  const uploadUrl = await store.uploadUrl(key, type.contentType);
  const ticket = signToken(
    {
      key,
      folderId,
      fileName,
      contentType: type.contentType,
      kind: type.kind,
      userId: viewer.id,
      exp: now() + TICKET_MS,
    },
    getEnv().BETTER_AUTH_SECRET,
  );
  return ok({ uploadUrl, ticket, contentType: type.contentType });
}

/** Step 2: after the browser uploaded the file, checks it arrived and adds it to the folder. */
export async function finishUpload(
  raw: unknown,
  viewer: SongBankViewer,
  store: FileStore | null = getFileStore(),
  now: () => number = Date.now,
): Promise<Result<{ id: string }>> {
  if (!canContribute(viewer)) return err("FORBIDDEN", "Only admins, committee and section leads can upload");
  if (!store) return err("EXTERNAL", "File uploads aren't set up yet");
  const parsed = finishUploadSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const ticket = ticketSchema.safeParse(verifyToken(parsed.data.ticket, getEnv().BETTER_AUTH_SECRET));
  if (!ticket.success || ticket.data.userId !== viewer.id || ticket.data.exp < now()) {
    return err("VALIDATION", "This upload expired. Please upload the file again.");
  }
  const { key, folderId, fileName, contentType, kind } = ticket.data;

  const stored = await store.stat(key);
  if (!stored) return err("EXTERNAL", `${fileName} didn't finish uploading. Please try again.`);
  if (stored.sizeBytes > MAX_UPLOAD_BYTES[kind]) {
    await removeStoredFiles([key], store);
    return err("VALIDATION", `${fileName} is too big (the limit is ${formatBytes(MAX_UPLOAD_BYTES[kind])})`);
  }
  if (await prisma.songFile.findUnique({ where: { storageKey: key }, select: { id: true } })) {
    return err("CONFLICT", `${fileName} was already added`);
  }
  if (!(await prisma.songFolder.findUnique({ where: { id: folderId }, select: { id: true } }))) {
    await removeStoredFiles([key], store);
    return err("NOT_FOUND", "That folder was deleted while the file was uploading");
  }

  const file = await prisma.$transaction(async (tx) => {
    const created = await tx.songFile.create({
      data: {
        folderId,
        kind,
        title: parsed.data.title,
        voicePart: parsed.data.voicePart,
        storageKey: key,
        fileName,
        contentType,
        sizeBytes: stored.sizeBytes,
        uploadedById: viewer.id,
      },
    });
    await writeAuditLog(
      {
        actorId: viewer.id,
        action: "songbank.file.upload",
        entity: "song_file",
        entityId: created.id,
        diff: { folderId, title: created.title, kind, voicePart: created.voicePart, sizeBytes: stored.sizeBytes },
      },
      tx,
    );
    return created;
  });
  return ok({ id: file.id });
}

/** Adds a link (e.g. a recording already on Google Drive) to a folder. */
export async function addLink(raw: unknown, viewer: SongBankViewer): Promise<Result<{ id: string }>> {
  if (!canContribute(viewer)) return err("FORBIDDEN", "Only admins, committee and section leads can add links");
  const parsed = linkInputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { folderId, title, voicePart, url } = parsed.data;
  if (!(await prisma.songFolder.findUnique({ where: { id: folderId }, select: { id: true } }))) {
    return err("NOT_FOUND", "That folder no longer exists");
  }
  const file = await prisma.$transaction(async (tx) => {
    const created = await tx.songFile.create({
      data: { folderId, kind: "LINK", title, voicePart, linkUrl: url, uploadedById: viewer.id },
    });
    await writeAuditLog(
      {
        actorId: viewer.id,
        action: "songbank.file.link",
        entity: "song_file",
        entityId: created.id,
        diff: { folderId, title, voicePart },
      },
      tx,
    );
    return created;
  });
  return ok({ id: file.id });
}

/** Changes a file's title, part or folder (and a link's address). */
export async function updateFile(id: string, raw: unknown, viewer: SongBankViewer): Promise<Result<null>> {
  const parsed = fileUpdateSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const current = await prisma.songFile.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "File not found");
  if (!canChangeFile(viewer, current)) return err("FORBIDDEN", "You can only change files you added");
  const { title, voicePart, folderId, url } = parsed.data;
  if (folderId !== current.folderId) {
    if (!(await prisma.songFolder.findUnique({ where: { id: folderId }, select: { id: true } }))) {
      return err("NOT_FOUND", "The folder to move it into no longer exists");
    }
  }
  if (current.kind === "LINK" && !url) {
    return err("VALIDATION", "Please fix the highlighted fields", { url: ["Paste the link"] });
  }

  await prisma.$transaction(async (tx) => {
    await tx.songFile.update({
      where: { id },
      data: { title, voicePart, folderId, ...(current.kind === "LINK" ? { linkUrl: url } : {}) },
    });
    await writeAuditLog(
      {
        actorId: viewer.id,
        action: "songbank.file.update",
        entity: "song_file",
        entityId: id,
        diff: {
          from: { title: current.title, voicePart: current.voicePart, folderId: current.folderId },
          to: { title, voicePart, folderId },
        },
      },
      tx,
    );
  });
  return ok(null);
}

export async function deleteFile(
  id: string,
  viewer: SongBankViewer,
  store: FileStore | null = getFileStore(),
): Promise<Result<{ folderId: string }>> {
  const current = await prisma.songFile.findUnique({ where: { id } });
  if (!current) return err("NOT_FOUND", "File not found");
  if (!canChangeFile(viewer, current)) return err("FORBIDDEN", "You can only delete files you added");
  await prisma.$transaction(async (tx) => {
    await tx.songFile.delete({ where: { id } });
    await writeAuditLog(
      {
        actorId: viewer.id,
        action: "songbank.file.delete",
        entity: "song_file",
        entityId: id,
        diff: { title: current.title, folderId: current.folderId, kind: current.kind },
      },
      tx,
    );
  });
  await removeStoredFiles([current.storageKey], store);
  return ok({ folderId: current.folderId });
}

/** One file, the path to its folder, and the folder's recordings (to play along with sheet music). */
export async function getSongFile(id: string) {
  const file = await prisma.songFile.findUnique({
    where: { id },
    include: { uploadedBy: { select: { name: true } } },
  });
  if (!file) return null;
  const [folders, recordings] = await Promise.all([
    prisma.songFolder.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.songFile.findMany({
      where: { folderId: file.folderId, kind: "AUDIO" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, voicePart: true, contentType: true },
    }),
  ]);
  const path = folderPath(new Map(folders.map((folder) => [folder.id, folder])), file.folderId);
  return { file, path, recordings };
}

/**
 * Where to send the browser to play, open or download a file: a short-lived
 * signed storage link, or a link item's own address. Null when there's none.
 */
export async function fileLinkFor(
  id: string,
  options: { download: boolean },
  store: FileStore | null = getFileStore(),
): Promise<string | null> {
  const file = await prisma.songFile.findUnique({
    where: { id },
    select: { kind: true, linkUrl: true, storageKey: true, fileName: true, contentType: true },
  });
  if (!file) return null;
  if (file.kind === "LINK") return file.linkUrl;
  if (!file.storageKey || !store) return null;
  return store.downloadUrl(file.storageKey, {
    fileName: file.fileName ?? "file",
    contentType: file.contentType ?? "application/octet-stream",
    download: options.download,
  });
}

/** The newest files across the song bank, with the folder they're in. */
export async function listRecentFiles(take = 8) {
  return prisma.songFile.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      title: true,
      voicePart: true,
      createdAt: true,
      folder: { select: { id: true, name: true } },
    },
  });
}
