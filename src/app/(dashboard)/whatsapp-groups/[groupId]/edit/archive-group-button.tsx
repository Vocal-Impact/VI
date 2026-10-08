"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { SubmitButton } from "@/shared/ui/client";

/** Small icon button in the corner of the group form: archive (or restore) the group, after confirming. */
export function ArchiveGroupButton({ name, archived }: { name: string; archived: boolean }) {
  const label = archived ? `Restore ${name}` : `Archive ${name}`;
  return (
    <SubmitButton
      variant="ghost"
      size="sm"
      aria-label={label}
      title={archived ? "Restore group" : "Archive group"}
      pendingText=""
      className="size-9 px-0 text-slate-500 hover:text-ink"
      confirm={
        archived
          ? {
              title: `Restore “${name}”?`,
              description: "It shows up for invites again, at the bottom of the list.",
              confirmLabel: "Restore group",
            }
          : {
              title: `Archive “${name}”?`,
              description: "It won't be offered for invites any more. Its history is kept and you can restore it here.",
              confirmLabel: "Archive group",
              tone: "danger",
            }
      }
    >
      {archived ? (
        <ArchiveRestore className="size-4" aria-hidden="true" />
      ) : (
        <Archive className="size-4" aria-hidden="true" />
      )}
    </SubmitButton>
  );
}
