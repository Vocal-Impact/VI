import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { signString, verifyString } from "@/shared/crypto/signed-token";
import { STORAGE_KEY_PATTERN } from "../domain/song-bank";
import type { FileStore } from "../domain/ports";

/** The route handler that serves these links (src/app/api/song-bank/local/route.ts). */
export const LOCAL_STORE_PATH = "/api/song-bank/local";

const LINK_MS = 60 * 60 * 1000;

type Operation = "get" | "put";

function signedFields(params: URLSearchParams): string {
  return ["op", "key", "exp", "type", "name", "dl"].map((field) => `${field}=${params.get(field) ?? ""}`).join("&");
}

/**
 * Song bank files on this computer, for local development without R2. Uses
 * the same signed, expiring links as R2, served by the app itself. Never used
 * on Vercel (its file system isn't kept between requests).
 */
export class LocalFileStore implements FileStore {
  constructor(
    private readonly root: string,
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  private filePath(key: string): string {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    return path.join(this.root, ...key.split("/"));
  }

  private link(op: Operation, key: string, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({ op, key, exp: String(this.now() + LINK_MS), ...extra });
    params.set("sig", signString(signedFields(params), this.secret));
    return `${LOCAL_STORE_PATH}?${params}`;
  }

  async uploadUrl(key: string, contentType: string): Promise<string> {
    return this.link("put", key, { type: contentType });
  }

  async downloadUrl(key: string, options: { fileName: string; contentType: string; download: boolean }) {
    return this.link("get", key, {
      type: options.contentType,
      name: options.fileName,
      ...(options.download ? { dl: "1" } : {}),
    });
  }

  async stat(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      return { sizeBytes: (await stat(this.filePath(key))).size };
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.filePath(key), { force: true });
  }

  /** Handles a GET (play/download, with Range support for seeking) or PUT (upload) on a signed link. */
  async handle(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const op = params.get("op");
    const key = params.get("key") ?? "";
    const exp = Number(params.get("exp"));
    const valid =
      (op === "get" || op === "put") &&
      STORAGE_KEY_PATTERN.test(key) &&
      Number.isFinite(exp) &&
      exp > this.now() &&
      verifyString(signedFields(params), params.get("sig") ?? "", this.secret);
    if (!valid) return new Response("Link expired or invalid", { status: 403 });

    const file = this.filePath(key);
    if (op === "put") {
      if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(await request.arrayBuffer()));
      return new Response(null, { status: 200 });
    }

    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    const size = (await this.stat(key))?.sizeBytes;
    if (size === undefined) return new Response("Not found", { status: 404 });
    const name = params.get("name") ?? path.basename(file);
    const headers = new Headers({
      "Content-Type": params.get("type") ?? "application/octet-stream",
      "Content-Disposition": `${params.get("dl") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    });

    // Audio seeking asks for byte ranges ("bytes=1000-").
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
      headers.set("Content-Length", String(end - start + 1));
      const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
      return new Response(body, { status: 206, headers });
    }
    headers.set("Content-Length", String(size));
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers });
  }
}
