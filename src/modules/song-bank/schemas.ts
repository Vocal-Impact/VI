import { z } from "zod";
import { isHttpsUrl, SONG_PARTS } from "./domain/song-bank";

const folderName = z
  .string()
  .trim()
  .min(1, "Give the folder a name")
  .max(80, "Keep it under 80 characters")
  .refine((name) => !/[\\/]/.test(name), "Folder names can't contain / or \\");

/** Empty = top level. */
const parentId = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null);

export const folderInputSchema = z.object({ name: folderName, parentId });
export type FolderInput = z.infer<typeof folderInputSchema>;

const title = z.string().trim().min(1, "Give it a title").max(120, "Keep it under 120 characters");

/** A part, or "" / null for the whole choir. */
const voicePart = z
  .union([z.enum(SONG_PARTS), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null);

export const startUploadSchema = z.object({
  folderId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive(),
});

export const finishUploadSchema = z.object({
  ticket: z.string().min(1).max(4000),
  title,
  voicePart,
});

export const linkInputSchema = z.object({
  folderId: z.uuid(),
  title,
  voicePart,
  url: z
    .string()
    .trim()
    .max(2000)
    .refine(isHttpsUrl, "Paste a full link starting with https:// (e.g. a Google Drive share link)"),
});

export const fileUpdateSchema = z.object({
  title,
  voicePart,
  folderId: z.uuid(),
  /** Links only. */
  url: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .refine((value) => value === undefined || value === "" || isHttpsUrl(value), "Links must start with https://"),
});
