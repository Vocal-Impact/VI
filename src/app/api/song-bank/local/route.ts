import { getLocalFileStore } from "@/modules/song-bank";

/**
 * Local development only (no R2 configured): serves the song bank's signed
 * upload and download links from `.local-storage/`. The signature is the
 * access check, like R2's signed links. Gone on Vercel.
 */
async function handle(request: Request): Promise<Response> {
  const store = getLocalFileStore();
  if (!store) return new Response("Not found", { status: 404 });
  return store.handle(request);
}

export const GET = handle;
export const PUT = handle;
