import "server-only";
import path from "node:path";
import { getEnv } from "@/shared/config/env";
import type { FileStore } from "../domain/ports";
import { LocalFileStore } from "./local-file-store";
import { R2FileStore } from "./r2-file-store";

let cached: { store: FileStore | null } | undefined;

/**
 * The song bank's file store: Cloudflare R2 when R2_* is set, files in
 * `.local-storage/` for local development, and none on Vercel without R2
 * (uploads are then turned off; links still work).
 */
export function getFileStore(): FileStore | null {
  if (cached) return cached.store;
  const env = getEnv();
  let store: FileStore | null = null;
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET) {
    store = new R2FileStore({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
    });
  } else if (!env.VERCEL_ENV) {
    store = getLocalFileStore();
  }
  cached = { store };
  return store;
}

/** The local store (only when the app isn't using R2), for the route handler that serves its links. */
export function getLocalFileStore(): LocalFileStore | null {
  const env = getEnv();
  if (env.VERCEL_ENV || env.R2_BUCKET) return null;
  return new LocalFileStore(path.join(process.cwd(), ".local-storage"), env.BETTER_AUTH_SECRET);
}
