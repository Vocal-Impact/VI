import Link from "next/link";
import { Folder } from "lucide-react";

export interface FolderCard {
  id: string;
  name: string;
  folderCount: number;
  fileCount: number;
}

function contentsLabel(folder: FolderCard): string {
  const parts = [
    folder.folderCount > 0 ? `${folder.folderCount} folder${folder.folderCount === 1 ? "" : "s"}` : null,
    folder.fileCount > 0 ? `${folder.fileCount} file${folder.fileCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Empty";
}

export function FolderGrid({ folders }: { folders: FolderCard[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {folders.map((folder) => (
        <li key={folder.id}>
          <Link
            href={`/song-bank/${folder.id}`}
            className="group flex items-center gap-3 rounded-xl border-2 border-ink bg-white px-4 py-3 shadow-sticker transition-transform hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-sticker-brand"
          >
            <Folder
              className="size-6 shrink-0 text-brand-600 transition-transform group-hover:-rotate-6"
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-ink">{folder.name}</span>
              <span className="block text-xs text-slate-500">{contentsLabel(folder)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
