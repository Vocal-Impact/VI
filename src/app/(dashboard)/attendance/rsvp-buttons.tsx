"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { RSVP_LABELS, type RsvpResponse } from "@/modules/attendance/domain";
import { cn } from "@/shared/lib/cn";
import { rsvpAction } from "./actions";

/** "Going" / "Can't make it" toggle for the signed-in member. */
export function RsvpButtons({
  practiceId,
  practiceLabel,
  current,
  disabled = false,
}: {
  practiceId: string;
  practiceLabel: string;
  current: RsvpResponse | null;
  disabled?: boolean;
}) {
  const [response, setResponse] = useState<RsvpResponse | null>(current);
  const [pending, startTransition] = useTransition();

  function choose(next: RsvpResponse) {
    if (next === response || disabled) return;
    const previous = response;
    setResponse(next);
    startTransition(async () => {
      const result = await rsvpAction(practiceId, next);
      if (result.ok) {
        toast.success(next === "GOING" ? "See you there! 🎶" : "Thanks for letting us know");
      } else {
        setResponse(previous);
        toast.error(result.error ?? "Could not save your reply");
      }
    });
  }

  const option = (value: RsvpResponse, Icon: typeof Check, activeClass: string) => (
    <button
      type="button"
      onClick={() => choose(value)}
      disabled={disabled || pending}
      aria-pressed={response === value}
      aria-label={`${RSVP_LABELS[value]} — ${practiceLabel}`}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border-2 px-3 text-sm font-semibold transition-all",
        "disabled:cursor-not-allowed disabled:opacity-50",
        response === value ? activeClass : "border-slate-200 bg-white text-slate-700 hover:border-slate-400",
      )}
    >
      <Icon className={cn("size-4", response === value && "animate-pop")} aria-hidden="true" />
      {RSVP_LABELS[value]}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Your reply for ${practiceLabel}`}>
      {option("GOING", Check, "border-emerald-600 bg-emerald-600 text-white")}
      {option("NOT_GOING", X, "border-red-500 bg-red-500 text-white")}
      {response === null && !disabled ? <span className="text-xs text-slate-500">Will you make it?</span> : null}
    </div>
  );
}
