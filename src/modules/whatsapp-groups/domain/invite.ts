/**
 * WhatsApp group & invite rules (blueprint §5.3). Pure and client-safe so the
 * invite dialog can preview exactly what the server will send.
 */

const INVITE_LINK = /^https:\/\/chat\.whatsapp\.com\/(?:invite\/)?[A-Za-z0-9]{10,40}\/?$/;

export function isValidInviteLink(value: string): boolean {
  return INVITE_LINK.test(value.trim());
}

export interface GroupRule {
  id: string;
  name: string;
  requiresEligibility: boolean;
  /** Voice parts that may join; empty = every part. */
  allowedVoiceTypes: readonly string[];
}

export interface MemberProgress {
  status: string;
  attendedCount: number;
  voiceType: string;
}

export type InviteDecision =
  { allowed: true; overridden: boolean } | { allowed: false; reason: string; overridable: true };

const PART_LABELS: Record<string, string> = {
  SOPRANO: "Sopranos",
  ALTO: "Altos",
  TENOR: "Tenors",
  BASS: "Basses",
  UNASSIGNED: "members without a part",
};

/** "Tenors only", "Sopranos & Altos only", or "All parts". */
export function describeAllowedParts(allowedVoiceTypes: readonly string[]): string {
  if (allowedVoiceTypes.length === 0) return "All parts";
  return `${allowedVoiceTypes.map((part) => PART_LABELS[part] ?? part).join(" & ")} only`;
}

/**
 * Who may be invited to a group:
 *  - Practice rule — only PROSPECTIVE members must reach the practice threshold
 *    for groups flagged "requires eligibility". Active/inactive members never are.
 *  - Part rule — part groups (e.g. Tenors) only take members of those parts.
 * Admins may override either rule (e.g. to add a committee member to a part group).
 */
export function canInviteToGroup(
  member: MemberProgress,
  group: Pick<GroupRule, "requiresEligibility" | "allowedVoiceTypes">,
  threshold: number,
  allowOverride = false,
): InviteDecision {
  const reasons: string[] = [];
  if (group.allowedVoiceTypes.length > 0 && !group.allowedVoiceTypes.includes(member.voiceType)) {
    reasons.push(`For ${describeAllowedParts(group.allowedVoiceTypes).replace(/ only$/, "")} only`);
  }
  if (group.requiresEligibility && member.status === "PROSPECTIVE" && member.attendedCount < threshold) {
    reasons.push(`Needs ${threshold} practices (has ${member.attendedCount})`);
  }
  if (reasons.length === 0) return { allowed: true, overridden: false };
  if (allowOverride) return { allowed: true, overridden: true };
  return { allowed: false, reason: reasons.join(" · "), overridable: true };
}

export interface InviteGroup {
  name: string;
  inviteLink: string;
}

export function renderInviteMessage(
  template: string,
  member: { firstName: string; lastName: string },
  groups: readonly InviteGroup[],
): string {
  const groupList = groups.map((group) => `• ${group.name} — ${group.inviteLink}`).join("\n");
  return template
    .replaceAll("{firstName}", member.firstName)
    .replaceAll("{lastName}", member.lastName)
    .replaceAll("{groupList}", groupList);
}

/**
 * The message split around {groupList}, so an email can show the groups as
 * buttons in exactly the place the committee put the list.
 */
export function renderInviteParts(
  template: string,
  member: { firstName: string; lastName: string },
): { before: string; after: string } {
  const filled = template.replaceAll("{firstName}", member.firstName).replaceAll("{lastName}", member.lastName);
  const index = filled.indexOf("{groupList}");
  if (index < 0) return { before: filled, after: "" };
  return {
    before: filled.slice(0, index),
    after: filled.slice(index + "{groupList}".length).replaceAll("{groupList}", ""),
  };
}

/**
 * Click-to-chat link that opens WhatsApp with the message pre-filled. A
 * committee member presses Send — no automation, no paid API.
 */
export function buildWaMeUrl(phoneE164: string, message: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export type GroupMembershipStatus = "NOT_INVITED" | "INVITED" | "JOINED" | "FAILED";

export interface InviteRecord {
  groupId: string;
  status: "SENT" | "JOINED" | "FAILED";
  sentAt: Date | string;
}

/** Joined wins; otherwise the most recent attempt decides. */
export function membershipStatus(invites: readonly InviteRecord[], groupId: string): GroupMembershipStatus {
  const forGroup = invites.filter((invite) => invite.groupId === groupId);
  if (forGroup.length === 0) return "NOT_INVITED";
  if (forGroup.some((invite) => invite.status === "JOINED")) return "JOINED";
  const latest = [...forGroup].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];
  return latest?.status === "FAILED" ? "FAILED" : "INVITED";
}

export const INVITE_CHANNEL_LABELS = {
  EMAIL: "Email",
  WHATSAPP_LINK: "WhatsApp (pre-filled)",
  MANUAL: "Copied / manual",
} as const;
