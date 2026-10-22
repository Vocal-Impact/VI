"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, FileAudio, FileText, Link2 } from "lucide-react";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import {
  filterByPart,
  formatBytes,
  isSongPart,
  SONG_PARTS,
  songFileContentHref,
  sortForPart,
  type PartFilter,
  type SongFileKind,
} from "@/modules/song-bank/domain";
import { AudioPlayer, PartBadge } from "@/modules/song-bank/ui";
import { cn } from "@/shared/lib/cn";
import { buttonClasses, LinkButton } from "@/shared/ui/button";
import { FormDialog } from "@/shared/ui/client";
import { EmptyState } from "@/shared/ui/layout";
import { DeleteFileForm, EditFileForm, type FolderOption } from "../song-bank-forms";

export interface FolderFile {
  id: string;
  folderId: string;
  kind: SongFileKind;
  title: string;
  voicePart: VoiceType | null;
  sizeBytes: number | null;
  linkUrl: string | null;
  uploadedBy: string | null;
  /** The viewer may rename, move or delete it. */
  canChange: boolean;
}

const KIND_ICONS = { AUDIO: FileAudio, PDF: FileText, LINK: Link2 } as const;

/** The files in a folder: your part first, a part filter, and players for recordings. */
export function FolderContents({
  files,
  myPart,
  folderOptions,
}: {
  files: FolderFile[];
  myPart: VoiceType | null;
  folderOptions: FolderOption[];
}) {
  const [filter, setFilter] = useState<PartFilter>("ALL");
  const shown = sortForPart(filterByPart(files, filter), myPart);
  const parts = SONG_PARTS.filter((part) => files.some((file) => file.voicePart === part));

  return (
    <div className="space-y-3">
      {parts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show files for">
          {(["ALL", ...parts] as PartFilter[]).map((part) => (
            <button
              key={part}
              type="button"
              aria-pressed={filter === part}
              onClick={() => setFilter(part)}
              className={cn(
                "rounded-full border-2 px-3 py-1 text-sm font-semibold transition-colors",
                filter === part
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
              )}
            >
              {part === "ALL" ? "All parts" : VOICE_TYPE_LABELS[part]}
              {isSongPart(part) && part === myPart ? " (you)" : ""}
            </button>
          ))}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState title="Nothing for this part yet" />
      ) : (
        <ul className="space-y-3">
          {shown.map((file) => {
            const Icon = KIND_ICONS[file.kind];
            return (
              <li key={file.id} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                        {file.kind === "LINK" ? (
                          <a
                            href={file.linkUrl ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {file.title}
                          </a>
                        ) : (
                          <Link href={`/song-bank/files/${file.id}`} className="hover:underline">
                            {file.title}
                          </Link>
                        )}
                        <PartBadge part={file.voicePart} mine={!!file.voicePart && file.voicePart === myPart} />
                      </p>
                      <p className="text-xs text-slate-500">
                        {[
                          file.kind === "PDF" ? "Sheet music" : file.kind === "LINK" ? "Link" : "Recording",
                          formatBytes(file.sizeBytes),
                          file.uploadedBy ? `added by ${file.uploadedBy}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {file.kind === "PDF" ? (
                      <LinkButton href={`/song-bank/files/${file.id}`} size="sm" variant="outline">
                        <FileText className="size-3.5" aria-hidden="true" /> Open
                      </LinkButton>
                    ) : null}
                    {file.kind === "LINK" ? (
                      <a
                        href={file.linkUrl ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses("outline", "sm")}
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" /> Open link
                      </a>
                    ) : null}
                    {file.canChange ? (
                      <>
                        <FormDialog
                          label="Edit"
                          title={`Edit “${file.title}”`}
                          openParam={`edit-${file.id}`}
                          icon="edit"
                          buttonVariant="ghost"
                          buttonSize="sm"
                        >
                          <EditFileForm file={file} folderOptions={folderOptions} />
                        </FormDialog>
                        <DeleteFileForm file={file} compact />
                      </>
                    ) : null}
                  </div>
                </div>
                {file.kind === "AUDIO" ? (
                  <AudioPlayer
                    className="mt-3"
                    src={songFileContentHref(file.id)}
                    downloadHref={songFileContentHref(file.id, true)}
                    title={file.title}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
