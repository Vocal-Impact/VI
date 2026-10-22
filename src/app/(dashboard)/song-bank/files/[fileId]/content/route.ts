import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/modules/auth";
import { fileLinkFor } from "@/modules/song-bank";
import { isFeatureEnabled } from "@/shared/config/features";

/**
 * Plays, opens or (with ?download=1) downloads a song bank file. Checks the
 * viewer may use the song bank, then redirects to a short-lived signed storage
 * link, so audio and PDFs stream straight from storage and a shared link stops
 * working within the hour.
 */
export async function GET(request: Request, ctx: RouteContext<"/song-bank/files/[fileId]/content">) {
  await requirePermission("songbank:read");
  if (!isFeatureEnabled("songBank")) notFound();
  const { fileId } = await ctx.params;
  if (!z.uuid().safeParse(fileId).success) notFound();
  const download = new URL(request.url).searchParams.get("download") === "1";
  const link = await fileLinkFor(fileId, { download });
  if (!link) notFound();
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(link, request.url).toString(), "Cache-Control": "private, no-store" },
  });
}
