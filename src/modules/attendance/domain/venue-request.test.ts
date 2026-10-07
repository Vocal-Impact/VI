import { describe, expect, it } from "vitest";
import { gmailComposeUrl, mailtoUrl, renderVenueRequest, type VenueRequestTemplate } from "./venue-request";

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

  it("builds a mailto link with CRLF line breaks", () => {
    const url = mailtoUrl(draft);
    expect(url.startsWith("mailto:facilities%40iit.ac.lk,events%40iit.ac.lk?cc=choir%40iit.ac.lk&subject=")).toBe(true);
    expect(decodeURIComponent(url.split("body=")[1]!)).toBe(draft.body.replace(/\n/g, "\r\n"));
  });
});
