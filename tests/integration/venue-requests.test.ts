import { describe, expect, it } from "vitest";
import { schedulePractice, sendVenueRequestReminders, setPracticeCancelled } from "@/modules/attendance";
import type { EmailMessage, EmailSender } from "@/modules/notifications";
import { prisma } from "@/shared/db/prisma";
import { todayLocal } from "@/shared/lib/clock";
import { addDays } from "@/shared/lib/dates";
import { updateSetting } from "@/shared/settings/settings";
import { createMember, createUser } from "../support/factories";

class Outbox implements EmailSender {
  messages: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}

describe("venue booking reminder", () => {
  it("emails every active admin a ready-made Gmail draft for the IIT administration", async () => {
    const admin = await createUser({ role: "ADMIN", email: "soshan.admin@iit.ac.lk" });
    await prisma.user.update({ where: { id: admin.id }, data: { name: "Soshan W" } });
    const retired = await createUser({ role: "ADMIN" });
    await prisma.user.update({ where: { id: retired.id }, data: { active: false } });
    const committee = await createUser({ role: "COMMITTEE" });
    await createMember({ status: "ACTIVE" });
    await createMember({ status: "PROSPECTIVE" });
    await updateSetting(
      "venueRequestTemplate",
      {
        to: ["facilities@iit.ac.lk"],
        cc: [],
        subject: "Hall for {date}",
        body: "Hello,\nWe need a hall at {time} for about {expected} people.\n{senderName}",
      },
      admin.id,
    );

    const scheduled = await schedulePractice(
      { date: addDays(todayLocal(), 7), startTime: "17:30", endTime: "19:30", title: "Practice", venue: "", notes: "" },
      committee.id,
    );
    if (!scheduled.ok) throw new Error(scheduled.error.message);

    const outbox = new Outbox();
    expect(await sendVenueRequestReminders(scheduled.value.id, { sender: outbox })).toEqual({ sent: 1, failed: 0 });

    const [email] = outbox.messages;
    expect(email?.to).toBe("soshan.admin@iit.ac.lk");
    expect(email?.subject).toMatch(/^📍 Book a venue for practice on /);
    expect(email?.text).toContain("We need a hall at 5:30 PM – 7:30 PM for about 2 people.\nSoshan W");

    const gmail = new URL(email!.html.match(/href="(https:\/\/mail\.google\.com[^"]+)"/)![1]!.replaceAll("&amp;", "&"));
    expect(gmail.searchParams.get("authuser")).toBe("soshan.admin@iit.ac.lk");
    expect(gmail.searchParams.get("to")).toBe("facilities@iit.ac.lk");
    expect(gmail.searchParams.get("body")).toContain("Soshan W");

    expect(await prisma.emailLog.findMany({ select: { type: true, recipient: true, status: true } })).toEqual([
      { type: "VENUE_REQUEST", recipient: "soshan.admin@iit.ac.lk", status: "SENT" },
    ]);
  });

  it("skips cancelled practices and records failed sends", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const scheduled = await schedulePractice(
      { date: addDays(todayLocal(), 3), startTime: "18:00", endTime: "", title: "Practice", venue: "", notes: "" },
      admin.id,
    );
    if (!scheduled.ok) throw new Error(scheduled.error.message);

    const failing: EmailSender = {
      send: async () => {
        throw new Error("Brevo is down");
      },
    };
    expect(await sendVenueRequestReminders(scheduled.value.id, { sender: failing })).toEqual({ sent: 0, failed: 1 });
    expect((await prisma.emailLog.findFirstOrThrow()).error).toBe("Brevo is down");

    await setPracticeCancelled(scheduled.value.id, true, admin.id);
    expect(await sendVenueRequestReminders(scheduled.value.id, { sender: new Outbox() })).toEqual({
      sent: 0,
      failed: 0,
    });
  });
});
