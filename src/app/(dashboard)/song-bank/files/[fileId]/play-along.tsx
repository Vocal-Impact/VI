"use client";

import { useId, useState } from "react";
import type { VoiceType } from "@/modules/members/domain";
import { partLabel, songFileContentHref, sortForPart } from "@/modules/song-bank/domain";
import { AudioPlayer } from "@/modules/song-bank/ui";
import { Select } from "@/shared/ui/form";

interface Recording {
  id: string;
  title: string;
  voicePart: VoiceType | null;
}

/**
 * Pinned to the bottom of the screen under the sheet music: pick one of the
 * folder's recordings (your part first) and follow the score while it plays.
 */
export function PlayAlong({ recordings, myPart }: { recordings: Recording[]; myPart: VoiceType | null }) {
  const sorted = sortForPart(
    recordings.map((recording) => ({ ...recording, kind: "AUDIO" as const })),
    myPart,
  );
  const [selected, setSelected] = useState(sorted[0]?.id ?? "");
  const id = useId();
  const current = sorted.find((recording) => recording.id === selected) ?? sorted[0];
  if (!current) return null;

  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="text-sm font-semibold text-ink">
            Play along
          </label>
          <Select
            id={id}
            value={current.id}
            onChange={(event) => setSelected(event.target.value)}
            className="h-9 w-auto max-w-full min-w-0 flex-1 sm:flex-none"
          >
            {sorted.map((recording) => (
              <option key={recording.id} value={recording.id}>
                {recording.title} ({partLabel(recording.voicePart)})
              </option>
            ))}
          </Select>
        </div>
        <AudioPlayer
          key={current.id}
          src={songFileContentHref(current.id)}
          downloadHref={songFileContentHref(current.id, true)}
          title={current.title}
          className="bg-white"
        />
      </div>
    </div>
  );
}
