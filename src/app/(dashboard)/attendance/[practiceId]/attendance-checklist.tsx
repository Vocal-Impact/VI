"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import type { ChecklistEntry } from "@/modules/attendance";
import { attendanceProgress } from "@/modules/attendance/domain";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { cn } from "@/shared/lib/cn";
import { Input } from "@/shared/ui/form";
import { Badge, Card, EmptyState } from "@/shared/ui/layout";
import { toggleAttendanceAction } from "../actions";

export function AttendanceChecklist({
  practiceId,
  entries: initialEntries,
  threshold,
  readOnly,
  canUnmark,
}: {
  practiceId: string;
  entries: ChecklistEntry[];
  threshold: number;
  readOnly: boolean;
  canUnmark: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(q) || entry.studentId.toLowerCase().includes(q));
  }, [entries, query]);
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
    <Card>
      <div className="sticky top-[57px] z-10 space-y-2 border-b border-slate-100 bg-white p-4 lg:top-0">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {presentCount} present <span className="text-slate-500">of {entries.length}</span>
          </span>
          {readOnly ? <Badge>View only</Badge> : <span className="text-slate-500">Tap a name to mark present</span>}
        </div>
        <Input
          type="search"
          placeholder="Search by name or student ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search members"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No one matches">
            New face?{" "}
            <Link href="/members/new" className="text-brand-700 underline">
              Add them as a member
            </Link>{" "}
            first.
          </EmptyState>
        </div>
      ) : (
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
      )}
    </Card>
  );
}
