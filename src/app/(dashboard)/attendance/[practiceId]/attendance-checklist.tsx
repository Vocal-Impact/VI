"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import type { ChecklistEntry } from "@/modules/attendance";
import { attendanceProgress } from "@/modules/attendance/domain";
import { LiveBadge } from "@/modules/attendance/ui";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { byVoicePart, VoicePartSelect, type VoicePartFilter } from "@/modules/members/ui";
import { cn } from "@/shared/lib/cn";
import { Input } from "@/shared/ui/form";
import { Badge, Card, EmptyState } from "@/shared/ui/layout";
import { toggleAttendanceAction } from "../actions";
import { CappedList } from "@/shared/ui/capped-list";

export function AttendanceChecklist({
  practiceId,
  entries: initialEntries,
  threshold,
  readOnly,
  canUnmark,
  prominent = false,
  live = false,
}: {
  practiceId: string;
  entries: ChecklistEntry[];
  threshold: number;
  readOnly: boolean;
  canUnmark: boolean;
  /** On the practice day: a big "Take attendance" heading, so it's the obvious thing on the page. */
  prominent?: boolean;
  /** The practice is on right now. */
  live?: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<VoicePartFilter>("ALL");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inPart = byVoicePart(entries, part);
    if (!q) return inPart;
    return inPart.filter((entry) => entry.name.toLowerCase().includes(q) || entry.studentId.toLowerCase().includes(q));
  }, [entries, query, part]);
  const presentCount = entries.filter((entry) => entry.present).length;

  function toggle(entry: ChecklistEntry) {
    if (readOnly || busy.has(entry.memberId)) return;
    const present = !entry.present;
    if (!present && !canUnmark) {
      toast.error("Only admins can change attendance after the practice day");
      return;
    }
    const update = (changes: Partial<ChecklistEntry>) =>
      setEntries((current) =>
        current.map((item) => (item.memberId === entry.memberId ? { ...item, ...changes } : item)),
      );

    update({ present, attendedCount: entry.attendedCount + (present ? 1 : -1) });
    setBusy((current) => new Set(current).add(entry.memberId));
    startTransition(async () => {
      const result = await toggleAttendanceAction(practiceId, entry.memberId, present);
      if (result.ok) {
        update({ present, attendedCount: result.attendedCount ?? entry.attendedCount });
        if (present && entry.status === "PROSPECTIVE" && (result.attendedCount ?? 0) === threshold) {
          toast.success(`${entry.name} is now ready for the WhatsApp groups! 🎉`);
        }
      } else {
        update({ present: entry.present, attendedCount: entry.attendedCount });
        toast.error(result.error ?? "Could not save");
      }
      setBusy((current) => {
        const next = new Set(current);
        next.delete(entry.memberId);
        return next;
      });
    });
  }

  return (
    <Card
      id="attendance"
      aria-label="Attendance"
      className={cn(
        "scroll-mt-20",
        prominent && (live ? "border-2 border-emerald-500 shadow-md" : "border-2 border-brand-300 shadow-md"),
      )}
    >
      <div
        className={cn(
          // Rounded to fit inside the card's corners (rounded-xl less its border); the card can't clip it without breaking sticky.
          "sticky top-[57px] z-10 space-y-2 rounded-t-[10px] border-b border-slate-100 p-4 lg:top-0",
          prominent && live ? "bg-emerald-50" : "bg-white",
        )}
      >
        {prominent ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 className="flex flex-wrap items-center gap-2 font-display text-xl font-black text-ink sm:text-2xl">
              {readOnly ? "Attendance" : "Take attendance"}
              {live ? <LiveBadge /> : null}
            </h2>
            <p className="text-sm text-slate-600">
              <span className="font-display text-2xl font-black text-ink tabular-nums">{presentCount}</span> present of{" "}
              {entries.length}
            </p>
          </div>
        ) : null}
        <div className="flex items-center justify-between text-sm">
          {prominent ? null : (
            <span className="font-medium">
              {presentCount} present <span className="text-slate-500">of {entries.length}</span>
            </span>
          )}
          {readOnly ? (
            <Badge>View only</Badge>
          ) : (
            <span className={prominent ? "font-medium text-slate-700" : "text-slate-500"}>
              Tap a name to mark present
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="search"
            placeholder="Search by name or student ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search members"
            className="sm:flex-1"
          />
          <VoicePartSelect value={part} onChange={setPart} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No one matches">
            New face?{" "}
            <Link href="/members?new=1" className="text-brand-700 underline">
              Add them as a member
            </Link>{" "}
            first.
          </EmptyState>
        </div>
      ) : (
        <CappedList
          visible={10}
          items=":scope > ul > li"
          label="Members to mark"
          // Rounded like the card's bottom corners (less its border), so the scrollbar and
          // the green "present" rows don't cover the card's outline there.
          className={prominent ? "rounded-b-[10px]" : "rounded-b-[11px]"}
        >
          <ul className="divide-y divide-slate-100" aria-label="Members">
            {filtered.map((entry) => (
              <li key={entry.memberId}>
                <button
                  type="button"
                  onClick={() => toggle(entry)}
                  disabled={readOnly}
                  aria-pressed={entry.present}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors disabled:cursor-default",
                    entry.present ? "bg-emerald-50" : "hover:bg-slate-50",
                  )}
                >
                  <span
                    key={entry.present ? "present" : "absent"}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                      entry.present ? "animate-pop border-emerald-600 bg-emerald-600 text-white" : "border-slate-300",
                    )}
                    aria-hidden="true"
                  >
                    {entry.present ? <Check className="size-4" /> : <span className="text-xs text-slate-300">♪</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{entry.name}</span>
                    <span className="block text-xs text-slate-500">
                      {VOICE_TYPE_LABELS[entry.voiceType as VoiceType]} · {entry.studentId}
                    </span>
                  </span>
                  {entry.rsvp ? (
                    <Badge tone={entry.rsvp === "GOING" ? "blue" : "neutral"}>
                      {entry.rsvp === "GOING" ? "Said going" : "Said no"}
                    </Badge>
                  ) : null}
                  {entry.status === "PROSPECTIVE" ? (
                    <Badge tone={entry.attendedCount >= threshold ? "green" : "amber"}>
                      New · {attendanceProgress(entry.attendedCount, threshold)}
                    </Badge>
                  ) : entry.status === "INACTIVE" ? (
                    <Badge>Inactive</Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </CappedList>
      )}
    </Card>
  );
}
