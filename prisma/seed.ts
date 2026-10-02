/**
 * Development seed: FAKE people only — never put real member data here.
 *
 *   npm run db:seed
 *
 * Creates a dev admin (password login, only works with ENABLE_PASSWORD_LOGIN),
 * sample WhatsApp groups, practices, members and attendance so every screen
 * has something to show.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, type VoiceType } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }) });

export const DEV_ADMIN = { email: "admin@example.com", password: "vocal-impact-dev", name: "Dev Admin" };

const FIRST = [
  "Amaya",
  "Kavindu",
  "Nethmi",
  "Ravindu",
  "Sachini",
  "Dinuka",
  "Tharushi",
  "Yasith",
  "Hiruni",
  "Pasindu",
  "Senuri",
  "Chamod",
];
const LAST = ["Perera", "Fernando", "Silva", "Jayasinghe", "Wickramasinghe", "Bandara", "Dissanayake", "Gunawardena"];
const VOICES: VoiceType[] = ["SOPRANO", "ALTO", "TENOR", "BASS"];
const AREAS: Array<[string, number, number]> = [
  ["Dehiwala", 6.851, 79.865],
  ["Mount Lavinia", 6.838, 79.866],
  ["Nugegoda", 6.872, 79.889],
  ["Maharagama", 6.848, 79.927],
  ["Kotte", 6.89, 79.902],
  ["Rajagiriya", 6.909, 79.894],
  ["Wattala", 6.989, 79.892],
  ["Moratuwa", 6.773, 79.882],
];

function isoDaysAgo(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

async function main(): Promise<void> {
  const adminId = "dev-admin";
  await prisma.user.upsert({
    where: { email: DEV_ADMIN.email },
    create: {
      id: adminId,
      email: DEV_ADMIN.email,
      name: DEV_ADMIN.name,
      role: "ADMIN",
      emailVerified: true,
      receivesBirthdayReminders: true,
    },
    update: { role: "ADMIN", active: true },
  });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: DEV_ADMIN.email } });
  const hasPassword = await prisma.account.findFirst({ where: { userId: admin.id, providerId: "credential" } });
  if (!hasPassword) {
    await prisma.account.create({
      data: {
        id: `credential-${admin.id}`,
        accountId: admin.id,
        providerId: "credential",
        userId: admin.id,
        password: await hashPassword(DEV_ADMIN.password),
      },
    });
  }

  const groups = [
    {
      name: "VI Newcomers",
      description: "Welcome group for people attending their first practices",
      requiresEligibility: false,
      isMainGroup: false,
      sortOrder: 1,
    },
    {
      name: "VI Main",
      description: "Announcements for the whole choir",
      requiresEligibility: true,
      isMainGroup: true,
      sortOrder: 2,
    },
    {
      name: "VI Section Chat",
      description: "Practice tracks per voice section",
      requiresEligibility: true,
      isMainGroup: false,
      sortOrder: 3,
    },
  ];
  for (const [index, group] of groups.entries()) {
    await prisma.whatsAppGroup.upsert({
      where: { name: group.name },
      create: { ...group, inviteLink: `https://chat.whatsapp.com/DevInviteLink${index}AbCdEf` },
      update: {},
    });
  }

  const practices = [];
  for (const daysAgo of [21, 14, 7]) {
    const date = isoDaysAgo(daysAgo);
    const existing = await prisma.practice.findFirst({ where: { date } });
    practices.push(
      existing ?? (await prisma.practice.create({ data: { date, title: "Practice", venue: "IIT Auditorium" } })),
    );
  }

  for (let i = 0; i < 24; i += 1) {
    const firstName = FIRST[i % FIRST.length]!;
    const lastName = LAST[(i * 3) % LAST.length]!;
    const studentId = `DEV${String(20240001 + i)}`;
    const status = i < 16 ? "ACTIVE" : "PROSPECTIVE";
    const dob = new Date(Date.UTC(2002 + (i % 4), (i * 5) % 12, ((i * 7) % 27) + 1));
    const member = await prisma.member.upsert({
      where: { studentId },
      create: {
        firstName,
        lastName,
        studentId,
        yearOfStudy: (i % 4) + 1,
        whatsappNumber: `+9477${String(1000000 + i * 7919).slice(0, 7)}`,
        email: `${firstName.toLowerCase()}.${studentId.toLowerCase()}@iit.ac.lk`,
        voiceType: VOICES[i % VOICES.length]!,
        dateOfBirth: i % 5 === 0 ? null : dob,
        status,
        source: "MANUAL",
        addedToWhatsappAt: status === "ACTIVE" ? isoDaysAgo(60) : null,
      },
      update: {},
    });

    // Prospective members: 0–3 practices so the eligibility list has entries.
    const attended = status === "ACTIVE" ? practices : practices.slice(0, i % 4);
    for (const practice of attended) {
      await prisma.attendance.upsert({
        where: { practiceId_memberId: { practiceId: practice.id, memberId: member.id } },
        create: { practiceId: practice.id, memberId: member.id, markedById: admin.id },
        update: {},
      });
    }

    if (i % 3 !== 2) {
      const [areaLabel, latitude, longitude] = AREAS[i % AREAS.length]!;
      await prisma.memberLocation.upsert({
        where: { memberId: member.id },
        create: {
          memberId: member.id,
          areaLabel,
          latitude: Math.round((latitude + (i % 3) * 0.004) * 1000) / 1000,
          longitude: Math.round((longitude - (i % 2) * 0.004) * 1000) / 1000,
          geocodeStatus: "OK",
          consentGiven: true,
          canDrive: i % 6 === 0,
          seats: i % 6 === 0 ? 3 : 0,
        },
        update: {},
      });
    }
  }

  console.log(`Seeded. Dev sign-in: ${DEV_ADMIN.email} / ${DEV_ADMIN.password} (requires ENABLE_PASSWORD_LOGIN=true)`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
