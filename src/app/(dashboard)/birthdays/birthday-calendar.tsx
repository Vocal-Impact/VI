"use client";

import Link from "next/link";
import { useState } from "react";
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

/**
 * Month grid of birthdays. Cells are too small for full names on a phone, so a
 * day with birthdays is a button: tapping (or clicking) it lists everyone below
 * the grid. On devices with a mouse, hovering also shows the names.
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
  const [selected, setSelected] = useState<number | null>(null);
  const isoFor = (day: number) => `${monthKey}-${String(day).padStart(2, "0")}` as IsoDate;
  const selectedPeople = selected ? (days[selected] ?? []) : [];

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
          const names = people.map((person) => person.name).join(", ");
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelected((current) => (current === day ? null : day))}
              aria-expanded={selected === day}
              aria-controls="birthday-details"
              aria-label={`${formatIsoDate(iso, { year: undefined })}: ${names}`}
              className={cn(
                cellClass,
                "group cursor-pointer transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-brand-600",
                selected === day && "border-brand-600 ring-2 ring-brand-200",
              )}
            >
              <span className="font-medium text-slate-500">{day}</span>
              {people.map((person) => (
                <span key={person.id} className="mt-0.5 block truncate rounded bg-brand-100 px-1 text-brand-800">
                  🎂 {person.name.split(" ")[0]}
                </span>
              ))}
              {/* Hover card (mouse only: Tailwind's hover variant doesn't apply on touch screens). */}
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
            </button>
          );
        })}
      </div>

      <div id="birthday-details" aria-live="polite">
        {selected && selectedPeople.length > 0 ? (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {formatIsoDate(isoFor(selected), { weekday: "long", month: "long", year: undefined })}
              </p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-ink"
                aria-label="Close"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <ul className="space-y-1.5 text-sm">
              {selectedPeople.map((person) => (
                <li key={person.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">🎂 {person.name}</span>
                  {person.detail ? <span className="text-slate-600">{person.detail}</span> : null}
                  {linkToProfiles ? (
                    <Link href={`/members/${person.id}`} className="text-brand-700 hover:underline">
                      Open profile
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">Tap a day with a 🎂 to see whose birthday it is.</p>
        )}
      </div>
    </>
  );
}
