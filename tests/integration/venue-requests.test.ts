import { describe, expect, it } from "vitest";
import {
  getPractice,
  schedulePractice,
  sendDueVenueRequestReminders,
  sendVenueRequestReminders,
  setPracticeCancelled,
  setVenueBooking,
  updatePractice,
} from "@/modules/attendance";
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

    // A week away: nothing yet, it's sent two days before.
    const outbox = new Outbox();
    expect(await sendVenueRequestReminders(scheduled.value.id, { sender: outbox })).toEqual({ sent: 0, failed: 0 });
    expect(outbox.messages).toHaveLength(0);
    const twoDaysBefore = addDays(todayLocal(), 5);
    expect(await sendDueVenueRequestReminders({ sender: outbox, today: addDays(todayLocal(), 4) })).toMatchObject({
      sent: 0,
    });
    expect(await sendDueVenueRequestReminders({ sender: outbox, today: twoDaysBefore })).toEqual({
      sent: 1,
      failed: 0,
      practices: 1,
    });

    const [email] = outbox.messages;
    expect(email?.to).toBe("soshan.admin@iit.ac.lk");
    expect(email?.subject).toMatch(/^📍 Book a venue for practice on /);
    // The email itself is short: a greeting and one centred "Send Email" button.
    expect(email?.html).toContain(">Send Email</a>");
    expect(email?.html).toContain('align="center"');
    expect(email?.html).not.toContain("already written");

    const gmail = new URL(email!.html.match(/href="(https:\/\/mail\.google\.com[^"]+)"/)![1]!.replaceAll("&amp;", "&"));
    expect(gmail.searchParams.get("authuser")).toBe("soshan.admin@iit.ac.lk");
    expect(gmail.searchParams.get("to")).toBe("facilities@iit.ac.lk");
    expect(gmail.searchParams.get("body")).toBe(
      "Hello,\nWe need a hall at 5:30 PM – 7:30 PM for about 2 people.\nSoshan W",
    );

    expect(await prisma.emailLog.findMany({ select: { type: true, recipient: true, status: true } })).toEqual([
      { type: "VENUE_REQUEST", recipient: "soshan.admin@iit.ac.lk", status: "SENT" },
    ]);
  });

  it("is sent straight away when the practice is tomorrow, and only once", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const scheduled = await schedulePractice(
      { date: addDays(todayLocal(), 1), startTime: "18:00", endTime: "", title: "Practice", venue: "", notes: "" },
      admin.id,
    );
    if (!scheduled.ok) throw new Error(scheduled.error.message);
    const outbox = new Outbox();
    expect(await sendVenueRequestReminders(scheduled.value.id, { sender: outbox })).toEqual({ sent: 1, failed: 0 });
    // An edit and the daily job don't send it again.
    expect(await sendVenueRequestReminders(scheduled.value.id, { sender: outbox })).toEqual({ sent: 0, failed: 0 });
    expect(await sendDueVenueRequestReminders({ sender: outbox })).toMatchObject({ sent: 0 });
    expect(outbox.messages).toHaveLength(1);
    expect((await getPractice(scheduled.value.id))?.venueReminderSentAt).not.toBeNull();
  });

  it("is skipped when an admin already marked the request as sent, or the practice was cancelled", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const schedule = async (days: number) => {
      const result = await schedulePractice(
        { date: addDays(todayLocal(), days), startTime: "18:00", endTime: "", title: "Practice", venue: "", notes: "" },
        admin.id,
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.value.id;
    };
    const handled = await schedule(6);
    await setVenueBooking(handled, { step: "requested", done: true }, admin.id);
    const cancelled = await schedule(6);
    await setPracticeCancelled(cancelled, true, admin.id);

    const outbox = new Outbox();
    expect(await sendDueVenueRequestReminders({ sender: outbox, today: addDays(todayLocal(), 4) })).toEqual({
      sent: 0,
      failed: 0,
      practices: 0,
    });
    expect(outbox.messages).toHaveLength(0);
  });

  it("is sent when a practice is moved closer, and retried the next day if sending failed", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const scheduled = await schedulePractice(
      { date: addDays(todayLocal(), 10), startTime: "18:00", endTime: "", title: "Practice", venue: "", notes: "" },
      admin.id,
    );
    if (!scheduled.ok) throw new Error(scheduled.error.message);
    const id = scheduled.value.id;
    const outbox = new Outbox();
    expect(await sendVenueRequestReminders(id, { sender: outbox })).toEqual({ sent: 0, failed: 0 });

    // Moved to tomorrow → due now. Brevo is down, so it isn't counted as sent…
    await updatePractice(
      id,
      { date: addDays(todayLocal(), 1), startTime: "18:00", endTime: "", title: "Practice", venue: "", notes: "" },
      admin.id,
    );
    const failing: EmailSender = {
      send: async () => {
        throw new Error("Brevo is down");
      },
    };
    expect(await sendVenueRequestReminders(id, { sender: failing })).toEqual({ sent: 0, failed: 1 });
    expect((await prisma.emailLog.findFirstOrThrow()).error).toBe("Brevo is down");
    expect((await getPractice(id))?.venueReminderSentAt).toBeNull();

    // …and the next run sends it.
    expect(await sendDueVenueRequestReminders({ sender: outbox })).toMatchObject({ sent: 1, practices: 1 });
  });
});

describe("venue booking progress", () => {
  it("records sent and confirmed, sets the confirmed venue, and undoes cleanly", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const scheduled = await schedulePractice(
      { date: addDays(todayLocal(), 5), startTime: "18:00", endTime: "", title: "Practice", venue: "", notes: "" },
      admin.id,
    );
    if (!scheduled.ok) throw new Error(scheduled.error.message);
    const id = scheduled.value.id;

    await setVenueBooking(id, { step: "requested", done: true }, admin.id);
    let practice = await getPractice(id);
    expect(practice?.venueRequestedAt).not.toBeNull();
    expect(practice?.venueConfirmedAt).toBeNull();

    await setVenueBooking(id, { step: "confirmed", done: true, venue: "  Studio 2 " }, admin.id);
    practice = await getPractice(id);
    expect(practice).toMatchObject({ venue: "Studio 2" });
    expect(practice?.venueConfirmedAt).not.toBeNull();

    await setVenueBooking(id, { step: "confirmed", done: false }, admin.id);
    practice = await getPractice(id);
    expect(practice?.venueConfirmedAt).toBeNull();
    expect(practice?.venueRequestedAt).not.toBeNull();

    // Confirming straight away also counts as requested; undoing "sent" clears both.
    await setVenueBooking(id, { step: "confirmed", done: true }, admin.id);
    await setVenueBooking(id, { step: "requested", done: false }, admin.id);
    practice = await getPractice(id);
    expect([practice?.venueRequestedAt, practice?.venueConfirmedAt]).toEqual([null, null]);
    expect(practice?.venue).toBe("Studio 2");

    expect(
      (await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } })).map((e) => e.action),
    ).toEqual([
      "practice.schedule",
      "practice.venue-requested",
      "practice.venue-confirmed",
      "practice.venue-confirmed-undone",
      "practice.venue-confirmed",
      "practice.venue-requested-undone",
    ]);
  });
});
