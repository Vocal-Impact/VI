/**
 * Port: where uploaded recordings and sheet music are kept. The browser uploads
 * and downloads straight from the store through short-lived signed links, so
 * large files never pass through the app's server (Vercel caps request and
 * response bodies at ~4.5 MB). Production adapter: Cloudflare R2.
 */
export interface FileStore {
  /** A link the browser PUTs the file to, with this Content-Type. Valid for a few minutes. */
  uploadUrl(key: string, contentType: string): Promise<string>;
  /** A link that plays or opens the file (or downloads it, with `download`). Valid for a short while. */
  downloadUrl(key: string, options: { fileName: string; contentType: string; download: boolean }): Promise<string>;
  /** The stored file's size, or null when nothing was uploaded under `key`. */
  stat(key: string): Promise<{ sizeBytes: number } | null>;
  /** Deletes the file. Deleting a missing file is not an error. */
  remove(key: string): Promise<void>;
}
