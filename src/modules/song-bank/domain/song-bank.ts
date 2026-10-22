import { hasPermission, type AccessRole } from "@/modules/auth/domain";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";

/**
 * Song bank rules: what can be uploaded, how files are ordered for a singer,
 * the folder tree and who may change what. Pure and client-safe.
 */

/** Parts a recording or score can be for. No part (null) = the whole choir (full track, full score). */
export const SONG_PARTS = ["SOPRANO", "ALTO", "TENOR", "BASS"] as const;
export type SongPart = (typeof SONG_PARTS)[number];

export const SONG_FILE_KINDS = ["AUDIO", "PDF", "LINK"] as const;
export type SongFileKind = (typeof SONG_FILE_KINDS)[number];

export const SONG_FILE_KIND_LABELS: Record<SongFileKind, string> = {
  AUDIO: "Recording",
  PDF: "Sheet music",
  LINK: "Link",
};

export function partLabel(part: VoiceType | null | undefined): string {
  return part && part !== "UNASSIGNED" ? VOICE_TYPE_LABELS[part] : "All parts";
}

export function isSongPart(value: unknown): value is SongPart {
  return typeof value === "string" && (SONG_PARTS as readonly string[]).includes(value);
}

// ─── Uploads ────────────────────────────────────────────────────────────────

/** Largest file that can be uploaded, per kind. */
export const MAX_UPLOAD_BYTES: Record<"AUDIO" | "PDF", number> = {
  AUDIO: 50 * 1024 * 1024,
  PDF: 25 * 1024 * 1024,
};

/**
 * Accepted file types by extension (browsers report audio types inconsistently,
 * e.g. "" for .opus on Windows), with the content type the file is stored and served as.
 */
const UPLOAD_TYPES: Record<string, { kind: "AUDIO" | "PDF"; contentType: string }> = {
  mp3: { kind: "AUDIO", contentType: "audio/mpeg" },
  m4a: { kind: "AUDIO", contentType: "audio/mp4" },
  mp4: { kind: "AUDIO", contentType: "audio/mp4" },
  aac: { kind: "AUDIO", contentType: "audio/aac" },
  wav: { kind: "AUDIO", contentType: "audio/wav" },
  flac: { kind: "AUDIO", contentType: "audio/flac" },
  ogg: { kind: "AUDIO", contentType: "audio/ogg" },
  // WhatsApp voice notes: Opus audio in an Ogg file.
  opus: { kind: "AUDIO", contentType: "audio/ogg" },
  webm: { kind: "AUDIO", contentType: "audio/webm" },
  pdf: { kind: "PDF", contentType: "application/pdf" },
};

/** For the file picker's `accept`. */
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** The kind and stored content type of an upload, or null when the type isn't accepted. */
export function uploadTypeOf(fileName: string): { kind: "AUDIO" | "PDF"; contentType: string } | null {
  return UPLOAD_TYPES[fileExtension(fileName)] ?? null;
}

/** Ogg/Opus and WebM audio don't play on some iPhones (older iOS Safari). */
export function mayNotPlayOnIphone(contentType: string | null | undefined): boolean {
  return contentType === "audio/ogg" || contentType === "audio/webm";
}

/** "Alto part (final).m4a" → "Alto part (final)": a starting title for an upload. */
export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return base.slice(0, 120) || "Untitled";
}

const PART_WORDS: Array<[RegExp, SongPart]> = [
  // Whole words only: short forms like "ten" or "alt" are too often ordinary words in song titles.
  [/\b(sop|soprano|sopranos)\b/i, "SOPRANO"],
  [/\b(alto|altos)\b/i, "ALTO"],
  [/\b(tenor|tenors)\b/i, "TENOR"],
  [/\b(bass|basses)\b/i, "BASS"],
];

/** A part named in the file name ("Silent Night - Alto.m4a" → ALTO), or null when none or several are. */
export function guessPartFromName(fileName: string): SongPart | null {
  const words = fileName.replace(/[_\-.()]+/g, " ");
  const found = PART_WORDS.filter(([pattern]) => pattern.test(words)).map(([, part]) => part);
  return found.length === 1 ? (found[0] ?? null) : null;
}

/** A safe object-storage file name: letters, digits, dot, dash and underscore. */
export function sanitizeFileName(fileName: string): string {
  const extension = fileExtension(fileName);
  const base = (extension ? fileName.slice(0, -(extension.length + 1)) : fileName)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "file"}${extension ? `.${extension.replace(/[^a-z0-9]/g, "")}` : ""}`;
}

/** Where an upload is stored. The random id keeps keys unguessable and unique. */
export function storageKeyFor(id: string, fileName: string): string {
  return `song-bank/${id}/${sanitizeFileName(fileName)}`;
}

export const STORAGE_KEY_PATTERN = /^song-bank\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/;

/** "3.4 MB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The app's link that plays or opens a stored file (it redirects to a short-lived storage link). */
export function songFileContentHref(fileId: string, download = false): string {
  return `/song-bank/files/${fileId}/content${download ? "?download=1" : ""}`;
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Ordering for a singer ──────────────────────────────────────────────────

export type PartFilter = SongPart | "ALL";

interface FileLike {
  title: string;
  voicePart: VoiceType | null;
  kind: SongFileKind;
}

/** One part: its files plus the whole-choir ones (full track, full score). "ALL" keeps everything. */
export function filterByPart<T extends FileLike>(files: readonly T[], filter: PartFilter): T[] {
  if (filter === "ALL") return [...files];
  return files.filter(
    (file) => file.voicePart === filter || file.voicePart === null || file.voicePart === "UNASSIGNED",
  );
}

const KIND_ORDER: Record<SongFileKind, number> = { PDF: 0, AUDIO: 1, LINK: 2 };

/**
 * Your part first, then whole-choir files, then the other parts in S-A-T-B order;
 * sheet music before recordings within each, then by title.
 */
export function sortForPart<T extends FileLike>(files: readonly T[], myPart: VoiceType | null | undefined): T[] {
  const rank = (part: VoiceType | null): number => {
    if (part && part !== "UNASSIGNED" && part === myPart) return 0;
    if (!part || part === "UNASSIGNED") return 1;
    return 2 + SONG_PARTS.indexOf(part as SongPart);
  };
  return [...files].sort(
    (a, b) =>
      rank(a.voicePart) - rank(b.voicePart) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
  );
}

// ─── Folder tree ────────────────────────────────────────────────────────────

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
}

/** The folders from the top level down to `id` (inclusive). Stops on a broken or looping chain. */
export function folderPath<T extends FolderNode>(folders: ReadonlyMap<string, T>, id: string): T[] {
  const path: T[] = [];
  const seen = new Set<string>();
  let current = folders.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? folders.get(current.parentId) : undefined;
  }
  return path;
}

/** Every folder inside `id`, at any depth (not `id` itself). */
export function descendantIds(folders: Iterable<FolderNode>, id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    if (!children.has(folder.parentId)) children.set(folder.parentId, []);
    children.get(folder.parentId)!.push(folder.id);
  }
  const found = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (found.has(next)) continue;
    found.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return found;
}

/** A folder can't be moved into itself or into one of its own subfolders. */
export function canMoveFolderTo(folders: Iterable<FolderNode>, folderId: string, newParentId: string | null): boolean {
  if (newParentId === null) return true;
  if (newParentId === folderId) return false;
  return !descendantIds(folders, folderId).has(newParentId);
}

/**
 * Every folder in tree order: each one followed by its subfolders (depth-first),
 * siblings by name, with how deep it is (0 = top level). A folder whose parent is
 * missing is treated as top level, so nothing is ever left out.
 */
export function folderTree<T extends FolderNode>(folders: Iterable<T>): Array<T & { depth: number }> {
  const all = [...folders];
  const ids = new Set(all.map((folder) => folder.id));
  const children = new Map<string | null, T[]>();
  for (const folder of all) {
    const parent = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(folder);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  }
  const ordered: Array<T & { depth: number }> = [];
  const seen = new Set<string>();
  const visit = (parent: string | null, depth: number) => {
    for (const folder of children.get(parent) ?? []) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      ordered.push({ ...folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}

/** A picker entry indented by its depth ("   └ Silent Night"); non-breaking spaces so the browser keeps them. */
export function indentedFolderName(name: string, depth: number): string {
  return depth === 0 ? name : `${"\u00A0\u00A0\u00A0".repeat(depth)}└\u00A0${name}`;
}

/** "2025 / Christmas concert / Silent Night", for pickers. */
export function folderLabel(folders: ReadonlyMap<string, FolderNode>, id: string): string {
  return folderPath(folders, id)
    .map((folder) => folder.name)
    .join(" / ");
}

// ─── Who may change what ────────────────────────────────────────────────────

export interface SongBankViewer {
  id: string;
  role: AccessRole;
  /** Section leads add recordings and sheet music, and change what they added. */
  sectionLead: boolean;
}

/** Admins and committee look after the whole song bank. */
export function canManageSongBank(viewer: SongBankViewer): boolean {
  return hasPermission(viewer.role, "songbank:manage");
}

/** Add folders, uploads and links: managers and section leads. */
export function canContribute(viewer: SongBankViewer): boolean {
  return hasPermission(viewer.role, "songbank:read") && (canManageSongBank(viewer) || viewer.sectionLead);
}

/** Rename, move or delete a file: managers, or a contributor who added it. */
export function canChangeFile(viewer: SongBankViewer, file: { uploadedById: string | null }): boolean {
  return canManageSongBank(viewer) || (canContribute(viewer) && file.uploadedById === viewer.id);
}

/** Rename or move a folder: managers, or a contributor who made it. */
export function canChangeFolder(viewer: SongBankViewer, folder: { createdById: string | null }): boolean {
  return canManageSongBank(viewer) || (canContribute(viewer) && folder.createdById === viewer.id);
}

/** Delete a folder: managers (with everything in it), or the contributor who made it while it's empty. */
export function canDeleteFolder(
  viewer: SongBankViewer,
  folder: { createdById: string | null },
  isEmpty: boolean,
): boolean {
  return canManageSongBank(viewer) || (isEmpty && canChangeFolder(viewer, folder));
}
