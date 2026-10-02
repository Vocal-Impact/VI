import { Badge } from "@/shared/ui/layout";
import { MEMBER_STATUS_LABELS, VOICE_TYPE_LABELS, type MemberStatus, type VoiceType } from "../domain/member";

const STATUS_TONES = { PROSPECTIVE: "amber", ACTIVE: "green", INACTIVE: "neutral", ALUMNI: "blue" } as const;
const VOICE_TONES = { SOPRANO: "red", ALTO: "brand", TENOR: "blue", BASS: "green", UNASSIGNED: "neutral" } as const;

export function StatusBadge({ status }: { status: MemberStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{MEMBER_STATUS_LABELS[status]}</Badge>;
}

export function VoiceBadge({ voiceType }: { voiceType: VoiceType }) {
  return <Badge tone={VOICE_TONES[voiceType]}>{VOICE_TYPE_LABELS[voiceType]}</Badge>;
}
