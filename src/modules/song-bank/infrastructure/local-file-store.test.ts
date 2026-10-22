import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStore } from "./local-file-store";

const SECRET = "test-secret-0123456789abcdef0123456789";
const KEY = "song-bank/0b6f3c1e-8a1d-4c55-9a43-2f1f0d4b9b10/alto.mp3";

let root: string;
let now: number;
let store: LocalFileStore;

const request = (link: string, init?: RequestInit) => new Request(new URL(link, "http://localhost:3000"), init);

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "song-bank-"));
  now = 1_000_000;
  store = new LocalFileStore(root, SECRET, () => now);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("LocalFileStore", () => {
  it("uploads through a signed link, then serves the file and byte ranges", async () => {
    const put = await store.handle(
      request(await store.uploadUrl(KEY, "audio/mpeg"), { method: "PUT", body: "0123456789" }),
    );
    expect(put.status).toBe(200);
    expect(await store.stat(KEY)).toEqual({ sizeBytes: 10 });

    const link = await store.downloadUrl(KEY, {
      fileName: "Alto part.mp3",
      contentType: "audio/mpeg",
      download: false,
    });
    const whole = await store.handle(request(link));
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("audio/mpeg");
    expect(whole.headers.get("content-disposition")).toContain("inline");
    expect(await whole.text()).toBe("0123456789");

    const part = await store.handle(request(link, { headers: { range: "bytes=2-5" } }));
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await part.text()).toBe("2345");

    await store.remove(KEY);
    expect(await store.stat(KEY)).toBeNull();
  });

  it("refuses changed, expired or wrong-operation links", async () => {
    const upload = await store.uploadUrl(KEY, "audio/mpeg");
    // An upload link can't be used to read, and a changed key breaks the signature.
    expect((await store.handle(request(upload))).status).toBe(405);
    const otherKey = upload.replace("alto.mp3", "bass.mp3");
    expect((await store.handle(request(otherKey, { method: "PUT", body: "x" }))).status).toBe(403);

    now += 2 * 60 * 60 * 1000;
    expect((await store.handle(request(upload, { method: "PUT", body: "x" }))).status).toBe(403);
  });
});
