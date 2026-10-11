"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { formatIsoDate, type IsoDate } from "@/shared/lib/dates";

export interface CalendarBirthday {
  id: string;
  name: string;
  /** Only for people allowed to see member details. */
  detail?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Gap between the day and the card, and the margin kept from the screen edges. */
const GAP = 6;
const EDGE = 12;

interface Opened {
  day: number;
  /** The day cell, to place the card next to it. */
  anchor: DOMRect;
}

/**
 * Month grid of birthdays. Cells are too small for full names on a phone, so a
 * day with birthdays is a button: tapping (or clicking) it opens a small card
 * over the calendar, next to that day, like a calendar app. On devices with a
 * mouse, hovering also shows the names.
 */
export function BirthdayCalendar({
  monthKey,
  leadingBlanks,
  daysInMonth,
  today,
  days,
  linkToProfiles,
}: {
  /** "2026-10" */
  monthKey: string;
  leadingBlanks: number;
  daysInMonth: number;
  today: string;
  days: Record<number, CalendarBirthday[]>;
  linkToProfiles: boolean;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const isoFor = (day: number) => `${monthKey}-${String(day).padStart(2, "0")}` as IsoDate;

  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
        {WEEKDAYS.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <div key={`blank-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const iso = isoFor(day);
          const people = days[day] ?? [];
          const cellClass = cn(
            "relative min-h-16 rounded-md border p-1 text-left text-xs sm:min-h-20",
            iso === today ? "border-brand-500 bg-brand-50" : "border-slate-100",
          );
          if (people.length === 0) {
            return (
              <div key={day} className={cellClass}>
                <span className="font-medium text-slate-500">{day}</span>
              </div>
            );
          }
          const isOpen = opened?.day === day;
          return (
            <button
              key={day}
              type="button"
              onClick={(event) =>
                setOpened(isOpen ? null : { day, anchor: event.currentTarget.getBoundingClientRect() })
              }
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              aria-label={`${formatIsoDate(iso, { year: undefined })}: ${people.map((person) => person.name).join(", ")}`}
              className={cn(
                cellClass,
                "group cursor-pointer transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-brand-600",
                isOpen && "border-brand-600 ring-2 ring-brand-200",
              )}
            >
              <span className="font-medium text-slate-500">{day}</span>
              {people.map((person) => (
                <span key={person.id} className="mt-0.5 block truncate rounded bg-brand-100 px-1 text-brand-800">
                  🎂 {person.name.split(" ")[0]}
                </span>
              ))}
              {/* Hover card (mouse only: Tailwind's hover variant doesn't apply on touch screens). */}
              {isOpen ? null : (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max max-w-56 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-left text-xs font-medium whitespace-normal text-white shadow-lg group-hover:block"
                >
                  {people.map((person) => (
                    <span key={person.id} className="block">
                      🎂 {person.name}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">Tap a day with a 🎂 to see whose birthday it is.</p>

      {opened ? (
        <BirthdayCard
          date={isoFor(opened.day)}
          anchor={opened.anchor}
          people={days[opened.day] ?? []}
          linkToProfiles={linkToProfiles}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </>
  );
}

/** The card that opens over the calendar, next to the tapped day. */
function BirthdayCard({
  date,
  anchor,
  people,
  linkToProfiles,
  onClose,
}: {
  date: IsoDate;
  anchor: DOMRect;
  people: CalendarBirthday[];
  linkToProfiles: boolean;
  onClose: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Below the day if it fits, otherwise above; always fully on screen.
  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    // offsetWidth/Height: the real size, unaffected by the pop-in animation's scale.
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const fitsBelow = anchor.bottom + GAP + height <= window.innerHeight - EDGE;
    const top = fitsBelow ? anchor.bottom + GAP : Math.max(EDGE, anchor.top - GAP - height);
    const centred = anchor.left + anchor.width / 2 - width / 2;
    const left = Math.min(Math.max(EDGE, centred), window.innerWidth - width - EDGE);
    setPosition({ top, left });
  }, [anchor]);

  // Close on Escape, and when the page scrolls or resizes (the day moves away from the card).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, { passive: true });
    window.addEventListener("resize", onClose);
    card.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // Rendered into <body>: an animated (transformed) parent would otherwise shift a fixed card.
  return createPortal(
    <>
      {/* Tapping anywhere else closes the card. */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div
        ref={card}
        role="dialog"
        aria-label={`Birthdays on ${formatIsoDate(date, { weekday: "long", month: "long", year: undefined })}`}
        tabIndex={-1}
        style={position ?? { top: anchor.bottom + GAP, left: EDGE, visibility: "hidden" }}
        className="fixed z-50 w-[min(18rem,calc(100vw-1.5rem))] animate-pop rounded-xl border border-slate-200 bg-white p-3 shadow-2xl outline-none"
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-ink">
            {formatIsoDate(date, { weekday: "long", month: "long", year: undefined })}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="-m-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <ul className="space-y-2">
          {people.map((person) => (
            <li key={person.id} className="rounded-lg bg-brand-50 px-2.5 py-2">
              <p className="text-sm font-semibold text-ink">🎂 {person.name}</p>
              {person.detail ? <p className="text-xs text-slate-600">{person.detail}</p> : null}
              {linkToProfiles ? (
                <Link
                  href={`/members/${person.id}`}
                  className="mt-0.5 inline-block text-xs font-medium text-brand-700 hover:underline"
                >
                  Open profile
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </>,
    document.body,
  );
}
