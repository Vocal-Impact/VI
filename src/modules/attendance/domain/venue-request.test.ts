import { describe, expect, it } from "vitest";
import {
  gmailComposeUrl,
  isVenueReminderDue,
  renderVenueRequest,
  venueReminderDueDate,
  type VenueRequestTemplate,
} from "./venue-request";

const template: VenueRequestTemplate = {
  to: ["facilities@iit.ac.lk", "events@iit.ac.lk"],
  cc: ["choir@iit.ac.lk"],
  subject: "Venue request: Vocal Impact practice on {date}",
  body: "Dear Sir/Madam,\n\nDate: {date}\nTime: {time}\nVenue: {venue}\nAbout {expected} members.\n\nThanks,\n{senderName}\n{unknown}",
};

const context = {
  date: "2026-10-15" as const,
  startTime: "17:30",
  endTime: "19:30",
  title: "Practice",
  venue: "Auditorium",
  expected: 42,
  senderName: "Soshan W",
};

describe("renderVenueRequest", () => {
  it("fills in the practice details and keeps unknown placeholders as typed", () => {
    const draft = renderVenueRequest(template, context);
    expect(draft.subject).toMatch(/^Venue request: Vocal Impact practice on Thursday,? 15 October 2026$/);
    expect(draft.body).toMatch(/Date: Thursday,? 15 October 2026\nTime: 5:30 PM – 7:30 PM\nVenue: Auditorium/);
    expect(draft.body).toContain("About 42 members.");
    expect(draft.body).toContain("Thanks,\nSoshan W\n{unknown}");
    expect(draft.to).toEqual(template.to);
  });

  it("says when the time or venue isn't set yet", () => {
    const draft = renderVenueRequest(template, { ...context, startTime: null, endTime: null, venue: "" });
    expect(draft.body).toContain("Time: to be confirmed\nVenue: any available hall");
  });
});

describe("compose links", () => {
  const draft = renderVenueRequest(template, context);

  it("opens a Gmail draft in the admin's own account", () => {
    const url = new URL(gmailComposeUrl(draft, "admin@iit.ac.lk"));
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      view: "cm",
      fs: "1",
      authuser: "admin@iit.ac.lk",
      to: "facilities@iit.ac.lk,events@iit.ac.lk",
      cc: "choir@iit.ac.lk",
      su: draft.subject,
      body: draft.body,
    });
  });

  it("leaves out empty recipients", () => {
    const url = new URL(gmailComposeUrl({ ...draft, to: [], cc: [] }));
    expect(url.searchParams.has("to")).toBe(false);
    expect(url.searchParams.has("cc")).toBe(false);
    expect(url.searchParams.has("authuser")).toBe(false);
  });
});

describe("isVenueReminderDue", () => {
  const today = "2026-10-07" as const;
  const practice = (date: string, extra: Partial<Parameters<typeof isVenueReminderDue>[0]> = {}) => ({
    date: date as `${number}-${number}-${number}`,
    status: "SCHEDULED" as const,
    venueRequestedAt: null,
    venueReminderSentAt: null,
    ...extra,
  });

  it("is due two days before the practice", () => {
    expect(venueReminderDueDate("2026-10-09")).toBe("2026-10-07");
    expect(isVenueReminderDue(practice("2026-10-09"), today)).toBe(true);
    expect(isVenueReminderDue(practice("2026-10-10"), today)).toBe(false); // three days away: wait
  });

  it("is due straight away for practices tomorrow or today", () => {
    expect(isVenueReminderDue(practice("2026-10-08"), today)).toBe(true);
    expect(isVenueReminderDue(practice("2026-10-07"), today)).toBe(true);
  });

  it("is never due once marked as sent, already reminded, cancelled or past", () => {
    expect(isVenueReminderDue(practice("2026-10-08", { venueRequestedAt: new Date() }), today)).toBe(false);
    expect(isVenueReminderDue(practice("2026-10-08", { venueReminderSentAt: new Date() }), today)).toBe(false);
    expect(isVenueReminderDue(practice("2026-10-08", { status: "CANCELLED" }), today)).toBe(false);
    expect(isVenueReminderDue(practice("2026-10-06"), today)).toBe(false);
  });
});
