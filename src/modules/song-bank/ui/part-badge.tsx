import type { VoiceType } from "@/modules/members/domain";
import { Badge } from "@/shared/ui/layout";
import { partLabel } from "../domain/song-bank";

const PART_TONES = { SOPRANO: "red", ALTO: "brand", TENOR: "blue", BASS: "green", UNASSIGNED: "neutral" } as const;

/** The part a file is for, or "All parts". */
export function PartBadge({ part, mine = false }: { part: VoiceType | null; mine?: boolean }) {
  return (
    <Badge tone={part ? PART_TONES[part] : "neutral"}>
      {partLabel(part)}
      {mine ? " · yours" : ""}
    </Badge>
  );
}
