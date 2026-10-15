"use client";

import { useId } from "react";
import { Select } from "@/shared/ui/form";
import { cn } from "@/shared/lib/cn";
import { VOICE_TYPES, VOICE_TYPE_LABELS, type VoiceType } from "../domain/member";

export type VoicePartFilter = VoiceType | "ALL";

/** Keeps the people in one voice part ("ALL" keeps everyone). */
export function byVoicePart<T extends { voiceType: string }>(people: readonly T[], part: VoicePartFilter): T[] {
  return part === "ALL" ? [...people] : people.filter((person) => person.voiceType === part);
}

/** "Voice part: All parts / Soprano / Alto / Tenor / Bass / Not assigned", to narrow a list to one section. */
export function VoicePartSelect({
  value,
  onChange,
  className,
}: {
  value: VoicePartFilter;
  onChange: (part: VoicePartFilter) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <label htmlFor={id} className="text-sm font-medium whitespace-nowrap text-slate-600">
        Voice part
      </label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as VoicePartFilter)}
        className="h-9 w-auto min-w-36"
      >
        <option value="ALL">All parts</option>
        {VOICE_TYPES.map((part) => (
          <option key={part} value={part}>
            {VOICE_TYPE_LABELS[part]}
          </option>
        ))}
      </Select>
    </span>
  );
}
