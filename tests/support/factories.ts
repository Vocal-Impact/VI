import { randomUUID } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import { fromIsoDate } from "@/shared/lib/dates";

let sequence = 0;
const next = () => (sequence += 1);

export async function createUser(
  overrides: Partial<{
    role: "ADMIN" | "COMMITTEE" | "MEMBER";
    email: string;
    receivesBirthdayReminders: boolean;
  }> = {},
) {
  const n = next();
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `Test User ${n}`,
      email: overrides.email ?? `user${n}@iit.ac.lk`,
      role: overrides.role ?? "ADMIN",
      emailVerified: true,
      receivesBirthdayReminders: overrides.receivesBirthdayReminders ?? false,
    },
  });
}

export async function createMember(
  overrides: Partial<{
    firstName: string;
    status: "PROSPECTIVE" | "ACTIVE" | "INACTIVE" | "ALUMNI";
    dateOfBirth: string | null;
    studentId: string;
    email: string;
    voiceType: "SOPRANO" | "ALTO" | "TENOR" | "BASS" | "UNASSIGNED";
  }> = {},
) {
  const n = next();
  return prisma.member.create({
    data: {
      firstName: overrides.firstName ?? `Member${n}`,
      lastName: "Test",
      studentId: overrides.studentId ?? `TST${100000 + n}`,
      yearOfStudy: 1,
      whatsappNumber: `+9477${String(1000000 + n).slice(0, 7)}`,
      email: overrides.email ?? `member${n}@iit.ac.lk`,
      voiceType: overrides.voiceType ?? "ALTO",
      status: overrides.status ?? "PROSPECTIVE",
      dateOfBirth: overrides.dateOfBirth ? fromIsoDate(overrides.dateOfBirth) : null,
    },
  });
}

export async function createPractice(date: string) {
  return prisma.practice.create({ data: { date: fromIsoDate(date), title: "Practice" } });
}

export async function createGroup(
  overrides: Partial<{
    name: string;
    requiresEligibility: boolean;
    isMainGroup: boolean;
    allowedVoiceTypes: Array<"SOPRANO" | "ALTO" | "TENOR" | "BASS">;
  }> = {},
) {
  const n = next();
  return prisma.whatsAppGroup.create({
    data: {
      name: overrides.name ?? `Group ${n}`,
      inviteLink: `https://chat.whatsapp.com/TestInvite${n}AbCdEfGh`,
      requiresEligibility: overrides.requiresEligibility ?? true,
      isMainGroup: overrides.isMainGroup ?? false,
      allowedVoiceTypes: overrides.allowedVoiceTypes ?? [],
    },
  });
}
