/** Identity fields used to detect that a "new" member already exists. */
export interface MemberIdentity {
  id: string;
  studentId: string;
  email: string;
  whatsappNumber: string;
}

export type DuplicateField = "studentId" | "email" | "whatsappNumber";

export interface DuplicateMatch {
  memberId: string;
  fields: DuplicateField[];
}

/**
 * Finds existing members sharing a student ID, email or WhatsApp number with
 * the candidate. `excludeId` skips the member being edited.
 */
export function findDuplicates(
  candidate: Omit<MemberIdentity, "id">,
  existing: readonly MemberIdentity[],
  excludeId?: string,
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (const member of existing) {
    if (member.id === excludeId) continue;
    const fields: DuplicateField[] = [];
    if (member.studentId === candidate.studentId) fields.push("studentId");
    if (member.email === candidate.email) fields.push("email");
    if (member.whatsappNumber === candidate.whatsappNumber) fields.push("whatsappNumber");
    if (fields.length > 0) matches.push({ memberId: member.id, fields });
  }
  return matches;
}
