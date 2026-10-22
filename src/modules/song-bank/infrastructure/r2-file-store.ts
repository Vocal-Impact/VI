import "server-only";
import { AwsClient } from "aws4fetch";
import type { FileStore } from "../domain/ports";

const UPLOAD_LINK_SECONDS = 15 * 60;
const DOWNLOAD_LINK_SECONDS = 60 * 60;

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** `filename*=` with UTF-8, plus a plain ASCII fallback, for Content-Disposition. */
function contentDisposition(type: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Cloudflare R2 through its S3-compatible API (requests signed with AWS SigV4).
 * The bucket stays private: every link is signed and expires.
 * https://developers.cloudflare.com/r2/api/s3/presigned-urls/
 */
export class R2FileStore implements FileStore {
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(
    config: R2Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    this.base = `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}`;
  }

  private objectUrl(key: string): URL {
    return new URL(`${this.base}/${key.split("/").map(encodeURIComponent).join("/")}`);
  }

  private async presign(url: URL, method: "GET" | "PUT", seconds: number): Promise<string> {
    url.searchParams.set("X-Amz-Expires", String(seconds));
    const signed = await this.client.sign(url.toString(), { method, aws: { signQuery: true } });
    return signed.url;
  }

  uploadUrl(key: string): Promise<string> {
    // The Content-Type the browser sends isn't part of the signature, so any type is accepted
    // here; the app checks the file's extension before handing out the link.
    return this.presign(this.objectUrl(key), "PUT", UPLOAD_LINK_SECONDS);
  }

  downloadUrl(key: string, options: { fileName: string; contentType: string; download: boolean }): Promise<string> {
    const url = this.objectUrl(key);
    url.searchParams.set("response-content-type", options.contentType);
    url.searchParams.set(
      "response-content-disposition",
      contentDisposition(options.download ? "attachment" : "inline", options.fileName),
    );
    return this.presign(url, "GET", DOWNLOAD_LINK_SECONDS);
  }

  async stat(key: string): Promise<{ sizeBytes: number } | null> {
    const request = await this.client.sign(this.objectUrl(key).toString(), { method: "HEAD" });
    const response = await this.fetchImpl(request);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`R2 HEAD failed: ${response.status}`);
    return { sizeBytes: Number(response.headers.get("content-length") ?? 0) };
  }

  async remove(key: string): Promise<void> {
    const request = await this.client.sign(this.objectUrl(key).toString(), { method: "DELETE" });
    const response = await this.fetchImpl(request);
    if (!response.ok && response.status !== 404) throw new Error(`R2 DELETE failed: ${response.status}`);
  }
}
