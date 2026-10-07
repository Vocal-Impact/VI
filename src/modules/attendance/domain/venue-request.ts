import { formatIsoDate, type IsoDate } from "@/shared/lib/dates";
import { formatTimeRange } from "./practice";

/**
 * The email admins send to the IIT administration to book a practice venue.
 * The app never sends it itself: it builds a ready-to-send draft that opens
 * in the admin's own Gmail, so the request comes from a real person.
 */

export interface VenueRequestTemplate {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
}

export interface VenueRequestContext {
  date: IsoDate;
  startTime: string | null;
  endTime: string | null;
  title: string;
  venue: string | null;
  /** Members expected (prospective + active). */
  expected: number;
  senderName: string;
}

export interface VenueRequestDraft {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
}

export const VENUE_REQUEST_PLACEHOLDERS = [
  "{date}",
  "{time}",
  "{title}",
  "{venue}",
  "{expected}",
  "{senderName}",
] as const;

export function renderVenueRequest(template: VenueRequestTemplate, context: VenueRequestContext): VenueRequestDraft {
  const values: Record<string, string> = {
    date: formatIsoDate(context.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    time: context.startTime ? formatTimeRange(context.startTime, context.endTime) : "to be confirmed",
    title: context.title,
    venue: context.venue?.trim() || "any available hall",
    expected: String(context.expected),
    senderName: context.senderName,
  };
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
  return { to: template.to, cc: template.cc, subject: fill(template.subject), body: fill(template.body) };
}

/**
 * Opens a Gmail compose window with the draft filled in. `authuser` picks the
 * admin's own account when they're signed in to several Google accounts.
 * Gmail drafts opened by link are plain text (line breaks and links are kept).
 */
export function gmailComposeUrl(draft: VenueRequestDraft, senderEmail?: string): string {
  const params = new URLSearchParams({ view: "cm", fs: "1" });
  if (senderEmail) params.set("authuser", senderEmail);
  if (draft.to.length) params.set("to", draft.to.join(","));
  if (draft.cc.length) params.set("cc", draft.cc.join(","));
  params.set("su", draft.subject);
  params.set("body", draft.body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/** The same draft for the device's default mail app (e.g. the Gmail or Mail app on a phone). */
export function mailtoUrl(draft: VenueRequestDraft): string {
  // encodeURIComponent writes spaces as %20, which every mail app understands (unlike "+").
  const encode = encodeURIComponent;
  const query = [
    draft.cc.length ? `cc=${encode(draft.cc.join(","))}` : null,
    `subject=${encode(draft.subject)}`,
    `body=${encode(draft.body.replace(/\r?\n/g, "\r\n"))}`,
  ]
    .filter(Boolean)
    .join("&");
  return `mailto:${draft.to.map(encodeURIComponent).join(",")}?${query}`;
}
