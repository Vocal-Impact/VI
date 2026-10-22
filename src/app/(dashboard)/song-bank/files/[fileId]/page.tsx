import { notFound } from "next/navigation";
import { z } from "zod";
import { ExternalLink } from "lucide-react";
import { requirePermission } from "@/modules/auth";
import {
  canChangeFile,
  formatBytes,
  getSongFile,
  listFolderOptions,
  SONG_FILE_KIND_LABELS,
  songFileContentHref,
} from "@/modules/song-bank";
import { AudioPlayer, PartBadge, PdfViewer } from "@/modules/song-bank/ui";
import { isFeatureEnabled } from "@/shared/config/features";
import { buttonClasses } from "@/shared/ui/button";
import { FormDialog } from "@/shared/ui/client";
import { PageHeader } from "@/shared/ui/layout";
import { Breadcrumbs } from "../../breadcrumbs";
import { DeleteFileForm, EditFileForm } from "../../song-bank-forms";
import { PlayAlong } from "./play-along";

export const metadata = { title: "Song bank" };

export default async function SongFilePage(props: PageProps<"/song-bank/files/[fileId]">) {
  const user = await requirePermission("songbank:read");
  if (!isFeatureEnabled("songBank")) notFound();
  const { fileId } = await props.params;
  if (!z.uuid().safeParse(fileId).success) notFound();
  const found = await getSongFile(fileId);
  if (!found) notFound();
  const { file, path, recordings } = found;
  const canChange = canChangeFile(user, file);
  const folderOptions = canChange ? await listFolderOptions() : [];
  const src = songFileContentHref(file.id);
  const downloadHref = songFileContentHref(file.id, true);

  return (
    <>
      <PageHeader
        back={<Breadcrumbs path={path} />}
        title={file.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <PartBadge part={file.voicePart} mine={!!file.voicePart && file.voicePart === user.voiceType} />
            {[
              SONG_FILE_KIND_LABELS[file.kind],
              formatBytes(file.sizeBytes),
              file.uploadedBy ? `added by ${file.uploadedBy.name}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        }
        actions={
          canChange ? (
            <>
              <FormDialog
                label="Edit"
                title={`Edit “${file.title}”`}
                openParam="edit"
                icon="edit"
                buttonVariant="outline"
              >
                <EditFileForm file={file} folderOptions={folderOptions} />
              </FormDialog>
              <DeleteFileForm file={file} backToFolder />
            </>
          ) : null
        }
      />

      {file.kind === "PDF" ? (
        <>
          <PdfViewer src={src} downloadHref={downloadHref} title={file.title} />
          <PlayAlong recordings={recordings} myPart={user.voiceType} />
        </>
      ) : file.kind === "AUDIO" ? (
        <AudioPlayer src={src} downloadHref={downloadHref} title={file.title} className="max-w-2xl bg-white p-4" />
      ) : (
        <a href={file.linkUrl ?? "#"} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary")}>
          <ExternalLink className="size-4" aria-hidden="true" /> Open link
        </a>
      )}
    </>
  );
}
