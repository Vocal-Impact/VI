import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth";
import { canContribute, isUploadAvailable, listFolders, listRecentFiles } from "@/modules/song-bank";
import { PartBadge } from "@/modules/song-bank/ui";
import { isFeatureEnabled } from "@/shared/config/features";
import { FormDialog } from "@/shared/ui/client";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/shared/ui/layout";
import { FolderGrid } from "./folder-grid";
import { NewFolderForm } from "./song-bank-forms";

export const metadata = { title: "Song bank" };

export default async function SongBankPage() {
  const user = await requirePermission("songbank:read");
  if (!isFeatureEnabled("songBank")) notFound();
  const contributor = canContribute(user);
  const [folders, recent] = await Promise.all([listFolders(null), listRecentFiles(6)]);

  return (
    <>
      <PageHeader
        title="Song bank"
        description="Part recordings and sheet music for every piece we've sung."
        actions={
          contributor ? (
            <FormDialog label="New folder" title="New folder">
              <NewFolderForm parentId={null} />
            </FormDialog>
          ) : null
        }
      />

      {contributor && !isUploadAvailable() ? (
        <Alert tone="info" className="mb-6" title="Uploads aren't set up yet">
          You can add folders and links (e.g. Google Drive) now. An admin needs to connect file storage (Cloudflare R2)
          before recordings and PDFs can be uploaded.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {folders.length === 0 ? (
            <EmptyState title="No songs yet">
              {contributor
                ? "Start with New folder above, e.g. one per year or concert."
                : "Your section leads will add recordings and sheet music here."}
            </EmptyState>
          ) : (
            <FolderGrid folders={folders} />
          )}
        </div>

        <Card className="self-start">
          <CardHeader title="Recently added" />
          <CardBody>
            {recent.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing yet.</p>
            ) : (
              <ul className="space-y-3">
                {recent.map((file) => (
                  <li key={file.id} className="min-w-0">
                    <Link
                      href={file.kind === "LINK" ? `/song-bank/${file.folder.id}` : `/song-bank/files/${file.id}`}
                      className="block truncate font-medium text-ink hover:underline"
                    >
                      {file.title}
                    </Link>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <PartBadge part={file.voicePart} /> in {file.folder.name}
                      {" · "}
                      {file.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
