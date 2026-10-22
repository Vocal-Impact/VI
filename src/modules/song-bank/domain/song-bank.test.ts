import { describe, expect, it } from "vitest";
import {
  canChangeFile,
  canChangeFolder,
  canContribute,
  canDeleteFolder,
  canMoveFolderTo,
  descendantIds,
  filterByPart,
  folderLabel,
  folderPath,
  folderTree,
  indentedFolderName,
  guessPartFromName,
  sanitizeFileName,
  sortForPart,
  STORAGE_KEY_PATTERN,
  storageKeyFor,
  titleFromFileName,
  uploadTypeOf,
  type FolderNode,
  type SongBankViewer,
} from "./song-bank";

describe("uploads", () => {
  it("accepts audio and PDFs by extension, whatever the browser says the type is", () => {
    expect(uploadTypeOf("Alto.M4A")).toEqual({ kind: "AUDIO", contentType: "audio/mp4" });
    expect(uploadTypeOf("PTT-20260101-WA0001.opus")).toEqual({ kind: "AUDIO", contentType: "audio/ogg" });
    expect(uploadTypeOf("Score.pdf")).toEqual({ kind: "PDF", contentType: "application/pdf" });
    expect(uploadTypeOf("notes.docx")).toBeNull();
    expect(uploadTypeOf("no-extension")).toBeNull();
  });

  it("makes storage-safe names and keys", () => {
    expect(sanitizeFileName("Silent Night – Alto (v2).m4a")).toBe("Silent-Night-Alto-v2.m4a");
    expect(sanitizeFileName("ආයුබෝවන්.mp3")).toBe("file.mp3");
    const key = storageKeyFor("0b6f3c1e-8a1d-4c55-9a43-2f1f0d4b9b10", "../../etc/passwd.mp3");
    expect(key).toBe("song-bank/0b6f3c1e-8a1d-4c55-9a43-2f1f0d4b9b10/etc-passwd.mp3");
    expect(STORAGE_KEY_PATTERN.test(key)).toBe(true);
    expect(STORAGE_KEY_PATTERN.test("song-bank/../x.mp3")).toBe(false);
  });

  it("starts the title from the file name and spots the part in it", () => {
    expect(titleFromFileName("Silent_Night_-_Alto.m4a")).toBe("Silent Night - Alto");
    expect(guessPartFromName("Silent Night - Alto.m4a")).toBe("ALTO");
    expect(guessPartFromName("hallelujah_SOPRANOS_final.mp3")).toBe("SOPRANO");
    expect(guessPartFromName("Bass & Tenor.mp3")).toBeNull(); // two parts: let them choose
    expect(guessPartFromName("Ten Thousand Reasons.mp3")).toBeNull();
    expect(guessPartFromName("Full track.mp3")).toBeNull();
  });
});

describe("ordering for a singer", () => {
  const files = [
    { title: "Bass", voicePart: "BASS", kind: "AUDIO" },
    { title: "Full track", voicePart: null, kind: "AUDIO" },
    { title: "Alto", voicePart: "ALTO", kind: "AUDIO" },
    { title: "Score", voicePart: null, kind: "PDF" },
    { title: "Soprano", voicePart: "SOPRANO", kind: "AUDIO" },
    { title: "Alto line", voicePart: "ALTO", kind: "PDF" },
  ] as const;

  it("puts your part first, then the whole-choir files, then the others in S-A-T-B order", () => {
    expect(sortForPart(files, "ALTO").map((file) => file.title)).toEqual([
      "Alto line",
      "Alto",
      "Score",
      "Full track",
      "Soprano",
      "Bass",
    ]);
    expect(sortForPart(files, null).map((file) => file.title)).toEqual([
      "Score",
      "Full track",
      "Soprano",
      "Alto line",
      "Alto",
      "Bass",
    ]);
  });

  it("filters to one part plus the whole-choir files", () => {
    expect(filterByPart(files, "BASS").map((file) => file.title)).toEqual(["Bass", "Full track", "Score"]);
    expect(filterByPart(files, "ALL")).toHaveLength(files.length);
  });
});

describe("folder tree", () => {
  const nodes: FolderNode[] = [
    { id: "y", name: "2026", parentId: null },
    { id: "c", name: "Christmas", parentId: "y" },
    { id: "s", name: "Silent Night", parentId: "c" },
    { id: "o", name: "Other", parentId: null },
  ];
  const map = new Map(nodes.map((node) => [node.id, node]));

  it("finds the path and the label", () => {
    expect(folderPath(map, "s").map((folder) => folder.id)).toEqual(["y", "c", "s"]);
    expect(folderLabel(map, "s")).toBe("2026 / Christmas / Silent Night");
    expect(folderPath(map, "missing")).toEqual([]);
  });

  it("survives a looping chain", () => {
    const loop = new Map<string, FolderNode>([
      ["a", { id: "a", name: "A", parentId: "b" }],
      ["b", { id: "b", name: "B", parentId: "a" }],
    ]);
    expect(folderPath(loop, "a").map((folder) => folder.id)).toEqual(["b", "a"]);
  });

  it("lists folders as a tree: each followed by its subfolders, siblings by name", () => {
    const tree = folderTree([
      ...nodes,
      { id: "e", name: "Easter", parentId: "y" },
      { id: "x", name: "2025", parentId: null },
    ]);
    expect(tree.map((folder) => [folder.name, folder.depth])).toEqual([
      ["2025", 0],
      ["2026", 0],
      ["Christmas", 1],
      ["Silent Night", 2],
      ["Easter", 1],
      ["Other", 0],
    ]);
    // A folder whose parent is gone still shows up, at the top level.
    expect(folderTree([{ id: "lost", name: "Lost", parentId: "deleted" }])).toEqual([
      { id: "lost", name: "Lost", parentId: "deleted", depth: 0 },
    ]);
  });

  it("indents picker entries by depth with spaces the browser keeps", () => {
    expect(indentedFolderName("2026", 0)).toBe("2026");
    expect(indentedFolderName("Silent Night", 2)).toBe(" ".repeat(6) + "└ Silent Night");
  });

  it("won't move a folder into itself or its own subfolders", () => {
    expect([...descendantIds(nodes, "y")].sort()).toEqual(["c", "s"]);
    expect(canMoveFolderTo(nodes, "y", "s")).toBe(false);
    expect(canMoveFolderTo(nodes, "y", "y")).toBe(false);
    expect(canMoveFolderTo(nodes, "s", "o")).toBe(true);
    expect(canMoveFolderTo(nodes, "s", null)).toBe(true);
  });
});

describe("who may change what", () => {
  const admin: SongBankViewer = { id: "admin", role: "ADMIN", sectionLead: false };
  const committee: SongBankViewer = { id: "committee", role: "COMMITTEE", sectionLead: false };
  const lead: SongBankViewer = { id: "lead", role: "MEMBER", sectionLead: true };
  const member: SongBankViewer = { id: "member", role: "MEMBER", sectionLead: false };
  const alumni: SongBankViewer = { id: "alumni", role: "ALUMNI", sectionLead: false };

  it("lets admins, committee and section leads add things; members and alumni only listen", () => {
    expect([admin, committee, lead].every(canContribute)).toBe(true);
    expect(canContribute(member)).toBe(false);
    expect(canContribute(alumni)).toBe(false);
  });

  it("lets section leads change only what they added", () => {
    expect(canChangeFile(lead, { uploadedById: "lead" })).toBe(true);
    expect(canChangeFile(lead, { uploadedById: "someone" })).toBe(false);
    expect(canChangeFile(committee, { uploadedById: "someone" })).toBe(true);
    expect(canChangeFile(member, { uploadedById: "member" })).toBe(false);
    expect(canChangeFolder(lead, { createdById: "lead" })).toBe(true);
    expect(canChangeFolder(lead, { createdById: null })).toBe(false);
  });

  it("lets only admins and committee delete folders that aren't empty", () => {
    expect(canDeleteFolder(lead, { createdById: "lead" }, true)).toBe(true);
    expect(canDeleteFolder(lead, { createdById: "lead" }, false)).toBe(false);
    expect(canDeleteFolder(committee, { createdById: "lead" }, false)).toBe(true);
  });
});
