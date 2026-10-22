import { describe, expect, it } from "vitest";
import { setMemberAccess } from "@/modules/auth";
import {
  addLink,
  createFolder,
  deleteFile,
  deleteFolder,
  fileLinkFor,
  finishUpload,
  getFolderView,
  startUpload,
  updateFile,
  updateFolder,
  type FileStore,
  type SongBankViewer,
} from "@/modules/song-bank";
import { prisma } from "@/shared/db/prisma";
import { createMember, createUser } from "../support/factories";

/** In-memory storage: "uploading" is putting a size under the key. */
class FakeFileStore implements FileStore {
  readonly files = new Map<string, number>();
  async uploadUrl(key: string) {
    return `https://storage.test/put/${key}`;
  }
  async downloadUrl(key: string, options: { download: boolean }) {
    return `https://storage.test/get/${key}${options.download ? "?download" : ""}`;
  }
  async stat(key: string) {
    const size = this.files.get(key);
    return size === undefined ? null : { sizeBytes: size };
  }
  async remove(key: string) {
    this.files.delete(key);
  }
}

async function viewer(role: "ADMIN" | "COMMITTEE" | "MEMBER", sectionLead = false): Promise<SongBankViewer> {
  const user = await createUser({ role });
  return { id: user.id, role, sectionLead };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function upload(store: FakeFileStore, by: SongBankViewer, folderId: string, fileName: string, size = 1000) {
  const started = unwrap(await startUpload({ folderId, fileName, sizeBytes: size }, by, store));
  const key = new URL(started.uploadUrl).pathname.replace("/put/", "");
  store.files.set(key, size);
  return unwrap(await finishUpload({ ticket: started.ticket, title: fileName, voicePart: "ALTO" }, by, store));
}

describe("song bank", () => {
  it("builds folders, uploads recordings and sheet music, and serves signed links", async () => {
    const store = new FakeFileStore();
    const lead = await viewer("MEMBER", true);
    const year = unwrap(await createFolder({ name: "2026", parentId: null }, lead));
    const song = unwrap(await createFolder({ name: "Silent Night", parentId: year.id }, lead));

    const recording = await upload(store, lead, song.id, "Silent Night - Alto.m4a");
    const score = await upload(store, lead, song.id, "Score.pdf");
    unwrap(
      await addLink(
        { folderId: song.id, title: "Full track", url: "https://drive.google.com/file/d/abc/view", voicePart: "" },
        lead,
      ),
    );

    const view = await getFolderView(song.id);
    expect(view?.path.map((folder) => folder.name)).toEqual(["2026", "Silent Night"]);
    expect(view?.files.map((file) => [file.kind, file.contentType, file.voicePart]).sort()).toEqual([
      ["AUDIO", "audio/mp4", "ALTO"],
      ["LINK", null, null],
      ["PDF", "application/pdf", "ALTO"],
    ]);
    const stored = await prisma.songFile.findUniqueOrThrow({ where: { id: recording.id } });
    expect(stored.storageKey).toMatch(/^song-bank\/[0-9a-f-]{36}\/Silent-Night-Alto\.m4a$/);
    expect(stored.sizeBytes).toBe(1000);

    expect(await fileLinkFor(score.id, { download: true }, store)).toMatch(
      /^https:\/\/storage\.test\/get\/.*\?download$/,
    );
    const link = view?.files.find((file) => file.kind === "LINK");
    expect(await fileLinkFor(link!.id, { download: false }, store)).toBe("https://drive.google.com/file/d/abc/view");
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "songbank." } } })).toBe(5);
  });

  it("refuses uploads from members, wrong types, big files and tampered or unfinished uploads", async () => {
    const store = new FakeFileStore();
    const admin = await viewer("ADMIN");
    const member = await viewer("MEMBER");
    const folder = unwrap(await createFolder({ name: "Hallelujah", parentId: null }, admin));

    expect((await createFolder({ name: "Mine", parentId: null }, member)).ok).toBe(false);
    expect((await startUpload({ folderId: folder.id, fileName: "a.mp3", sizeBytes: 10 }, member, store)).ok).toBe(
      false,
    );
    expect((await startUpload({ folderId: folder.id, fileName: "a.docx", sizeBytes: 10 }, admin, store)).ok).toBe(
      false,
    );
    expect(
      (await startUpload({ folderId: folder.id, fileName: "a.mp3", sizeBytes: 60 * 1024 * 1024 }, admin, store)).ok,
    ).toBe(false);
    expect((await startUpload({ folderId: folder.id, fileName: "a.mp3", sizeBytes: 10 }, admin, null)).ok).toBe(false);

    const started = unwrap(await startUpload({ folderId: folder.id, fileName: "a.mp3", sizeBytes: 10 }, admin, store));
    // Not uploaded yet.
    expect((await finishUpload({ ticket: started.ticket, title: "A", voicePart: "" }, admin, store)).ok).toBe(false);
    // Someone else's ticket, or a changed one.
    const other = await viewer("COMMITTEE");
    store.files.set(new URL(started.uploadUrl).pathname.replace("/put/", ""), 10);
    expect((await finishUpload({ ticket: started.ticket, title: "A", voicePart: "" }, other, store)).ok).toBe(false);
    expect((await finishUpload({ ticket: `${started.ticket}x`, title: "A", voicePart: "" }, admin, store)).ok).toBe(
      false,
    );
    // Uploaded more than it said: too big is removed again.
    store.files.set(new URL(started.uploadUrl).pathname.replace("/put/", ""), 80 * 1024 * 1024);
    expect((await finishUpload({ ticket: started.ticket, title: "A", voicePart: "" }, admin, store)).ok).toBe(false);
    expect(store.files.size).toBe(0);
    // Expired.
    const late = unwrap(await startUpload({ folderId: folder.id, fileName: "b.mp3", sizeBytes: 10 }, admin, store));
    store.files.set(new URL(late.uploadUrl).pathname.replace("/put/", ""), 10);
    const inTwoHours = () => Date.now() + 2 * 60 * 60 * 1000;
    expect((await finishUpload({ ticket: late.ticket, title: "B", voicePart: "" }, admin, store, inTwoHours)).ok).toBe(
      false,
    );
    expect(await prisma.songFile.count()).toBe(0);
  });

  it("lets section leads change only their own files; committee can change anything", async () => {
    const store = new FakeFileStore();
    const lead = await viewer("MEMBER", true);
    const otherLead = await viewer("MEMBER", true);
    const committee = await viewer("COMMITTEE");
    const folder = unwrap(await createFolder({ name: "Song", parentId: null }, lead));
    const other = unwrap(await createFolder({ name: "Other", parentId: null }, committee));
    const file = await upload(store, lead, folder.id, "Tenor.mp3");

    const change = { title: "Tenor (slow)", voicePart: "TENOR", folderId: other.id };
    expect((await updateFile(file.id, change, otherLead)).ok).toBe(false);
    expect((await deleteFile(file.id, otherLead, store)).ok).toBe(false);
    expect((await updateFile(file.id, change, lead)).ok).toBe(true);
    expect(await prisma.songFile.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({
      title: "Tenor (slow)",
      voicePart: "TENOR",
      folderId: other.id,
    });
    expect((await deleteFile(file.id, committee, store)).ok).toBe(true);
    expect(store.files.size).toBe(0);
  });

  it("renames and moves folders, but never into themselves", async () => {
    const admin = await viewer("ADMIN");
    const year = unwrap(await createFolder({ name: "2026", parentId: null }, admin));
    const song = unwrap(await createFolder({ name: "Song", parentId: year.id }, admin));

    expect((await createFolder({ name: "song", parentId: year.id }, admin)).ok).toBe(false); // same name here
    expect((await updateFolder(year.id, { name: "2026", parentId: song.id }, admin)).ok).toBe(false);
    expect((await updateFolder(song.id, { name: "Song (2026)", parentId: "" }, admin)).ok).toBe(true);
    expect(await prisma.songFolder.findUniqueOrThrow({ where: { id: song.id } })).toMatchObject({
      name: "Song (2026)",
      parentId: null,
    });
  });

  it("deletes a folder with everything in it, including the stored files", async () => {
    const store = new FakeFileStore();
    const lead = await viewer("MEMBER", true);
    const committee = await viewer("COMMITTEE");
    const year = unwrap(await createFolder({ name: "2025", parentId: null }, lead));
    const song = unwrap(await createFolder({ name: "Song", parentId: year.id }, lead));
    await upload(store, lead, song.id, "Bass.mp3");
    await upload(store, lead, year.id, "Programme.pdf");

    // Section leads can only delete their own folders while they're empty.
    expect((await deleteFolder(year.id, lead, store)).ok).toBe(false);
    const deleted = unwrap(await deleteFolder(year.id, committee, store));
    expect(deleted).toEqual({ parentId: null, deletedFiles: 2 });
    expect(await prisma.songFolder.count()).toBe(0);
    expect(await prisma.songFile.count()).toBe(0);
    expect(store.files.size).toBe(0);
  });

  it("makes a member a section lead from the Access page, whatever their access", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const member = await createMember({ voiceType: "TENOR" });
    const result = await setMemberAccess(
      { memberId: member.id, level: "NONE", receivesBirthdayReminders: false, sectionLead: true },
      admin.id,
    );
    expect(result).toEqual({ ok: true, value: { level: "NONE", sectionLeadChanged: true } });
    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).sectionLead).toBe(true);
    // Leaving it out keeps it.
    await setMemberAccess({ memberId: member.id, level: "COMMITTEE", receivesBirthdayReminders: false }, admin.id);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).sectionLead).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "access.section-lead" } })).toBe(1);
  });
});
