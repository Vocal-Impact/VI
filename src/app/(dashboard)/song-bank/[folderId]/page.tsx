import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/modules/auth";
import {
  canChangeFile,
  canChangeFolder,
  canContribute,
  canDeleteFolder,
  countFolderContents,
  getFolderView,
  isUploadAvailable,
  listDescendantFolderIds,
  listFolderOptions,
} from "@/modules/song-bank";
import { isFeatureEnabled } from "@/shared/config/features";
import { FormDialog } from "@/shared/ui/client";
import { EmptyState, PageHeader } from "@/shared/ui/layout";
import { Breadcrumbs } from "../breadcrumbs";
import { FolderGrid } from "../folder-grid";
import { DeleteFolderForm, EditFolderForm, LinkForm, NewFolderForm, UploadForm } from "../song-bank-forms";
import { FolderContents } from "./folder-contents";

export const metadata = { title: "Song bank" };

function countLabel(count: number, noun: string): string | null {
  return count > 0 ? `${count} ${noun}${count === 1 ? "" : "s"}` : null;
}

export default async function FolderPage(props: PageProps<"/song-bank/[folderId]">) {
  const user = await requirePermission("songbank:read");
  if (!isFeatureEnabled("songBank")) notFound();
  const { folderId } = await props.params;
  if (!z.uuid().safeParse(folderId).success) notFound();
  const view = await getFolderView(folderId);
  if (!view) notFound();
  const { folder, path, subfolders, files } = view;

  const contributor = canContribute(user);
  const canEditFolder = canChangeFolder(user, folder);
  const isEmpty = subfolders.length === 0 && files.length === 0;
  const mayDeleteFolder = canDeleteFolder(user, folder, isEmpty);
  const anyFileChangeable = files.some((file) => canChangeFile(user, file));
  const needsOptions = canEditFolder || anyFileChangeable;
  const [options, insideThis] = needsOptions
    ? await Promise.all([listFolderOptions(), listDescendantFolderIds(folder.id)])
    : [[], []];
  const excluded = new Set([folder.id, ...insideThis]);
  const inside = mayDeleteFolder && !isEmpty ? await countFolderContents(folder.id) : { folders: 0, files: 0 };
  const contents = [countLabel(inside.folders, "folder"), countLabel(inside.files, "file")]
    .filter(Boolean)
    .join(" and ");

  return (
    <>
      <PageHeader
        back={<Breadcrumbs path={path.slice(0, -1)} />}
        title={folder.name}
        actions={
          contributor ? (
            <>
              {isUploadAvailable() ? (
                <FormDialog
                  label="Upload"
                  title={`Upload to “${folder.name}”`}
                  description="Recordings for each part, full tracks and sheet music (PDF)."
                  openParam="upload"
                  size="lg"
                >
                  <UploadForm folderId={folder.id} myPart={user.voiceType} />
                </FormDialog>
              ) : null}
              <FormDialog
                label="Add link"
                title="Add a link"
                description="For a recording or score that's already online, e.g. on Google Drive."
                openParam="link"
                buttonVariant="outline"
              >
                <LinkForm folderId={folder.id} />
              </FormDialog>
              <FormDialog label="New folder" title={`New folder in “${folder.name}”`} buttonVariant="outline">
                <NewFolderForm parentId={folder.id} />
              </FormDialog>
              {canEditFolder || mayDeleteFolder ? (
                <FormDialog
                  label="Edit folder"
                  title={`Edit “${folder.name}”`}
                  openParam="edit"
                  icon="edit"
                  buttonVariant="ghost"
                >
                  <div className="space-y-4">
                    {canEditFolder ? (
                      <EditFolderForm
                        folder={folder}
                        folderOptions={options.filter((option) => !excluded.has(option.id))}
                      />
                    ) : null}
                    {mayDeleteFolder ? (
                      <div className="border-t border-slate-100 pt-3">
                        <DeleteFolderForm folder={folder} contents={isEmpty ? null : contents} />
                      </div>
                    ) : null}
                  </div>
                </FormDialog>
              ) : null}
            </>
          ) : null
        }
      />

      <div className="space-y-6">
        {subfolders.length > 0 ? <FolderGrid folders={subfolders} /> : null}

        {files.length > 0 ? (
          <FolderContents
            myPart={user.voiceType}
            folderOptions={options}
            files={files.map((file) => ({
              id: file.id,
              folderId: folder.id,
              kind: file.kind,
              title: file.title,
              voicePart: file.voicePart,
              sizeBytes: file.sizeBytes,
              linkUrl: file.linkUrl,
              uploadedBy: file.uploadedBy?.name ?? null,
              canChange: canChangeFile(user, file),
            }))}
          />
        ) : null}

        {isEmpty ? (
          <EmptyState title="This folder is empty">
            {contributor
              ? "Upload recordings or sheet music, add a link, or make a folder inside it."
              : "Recordings and sheet music will show up here once they're added."}
          </EmptyState>
        ) : null}
      </div>
    </>
  );
}
