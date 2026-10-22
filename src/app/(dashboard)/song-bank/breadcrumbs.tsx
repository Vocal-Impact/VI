import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** "Song bank › 2025 › Christmas concert": links to the song bank and each folder above this one. */
export function Breadcrumbs({ path }: { path: Array<{ id: string; name: string }> }) {
  return (
    <nav aria-label="Folders" className="flex flex-wrap items-center gap-1 text-sm">
      <Link href="/song-bank" className="text-brand-700 hover:underline">
        Song bank
      </Link>
      {path.map((folder) => (
        <span key={folder.id} className="inline-flex items-center gap-1">
          <ChevronRight className="size-3.5 text-slate-400" aria-hidden="true" />
          <Link href={`/song-bank/${folder.id}`} className="text-brand-700 hover:underline">
            {folder.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}
