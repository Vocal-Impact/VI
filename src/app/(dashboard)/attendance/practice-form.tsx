"use client";

import { formatIsoDate, isIsoDate } from "@/shared/lib/dates";
import { useActionState, useEffect, useRef, useState } from "react";
import { PRACTICE_AUDIENCE_LABELS, type PracticeAudience } from "@/modules/attendance/domain";
import { STUDY_LEVEL_LABELS, type StudyLevel } from "@/modules/members/domain";
import { cn } from "@/shared/lib/cn";
import { idleState, type ActionState } from "@/shared/lib/action-state";
import { ActionFeedback, CancelButton, SubmitButton } from "@/shared/ui/client";
import { Checkbox, Field, Input, Textarea } from "@/shared/ui/form";

export interface PracticeFormValues {
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  venue: string;
  notes: string;
  /** LEVELS practices: the levels invited. */
  levels?: string[];
  /** SELECTED practices: the members invited. */
  memberIds?: string[];
}

/** Someone an admin can pick for a chosen-members practice. */
export interface PickableMember {
  id: string;
  name: string;
  /** "L5 · Tenor", shown next to the name. */
  detail: string;
}

function describeDate(value: string): string {
  return isIsoDate(value) ? formatIsoDate(value, { weekday: "long", month: "long", year: undefined }) : "this date";
}

/** "a,b" (kept after a failed save) or the initial list. */
function listFrom(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value ? value.split(",").filter(Boolean) : [];
}

const AUDIENCE_HINTS: Record<PracticeAudience, string> = {
  MEMBERS: "Everyone in the choir sees it on their dashboard.",
  LEVELS: "Only members in the levels you tick see it.",
  SELECTED: "Only the members you pick see it.",
  ALUMNI: "Alumni see it on their dashboard.",
};

/** Schedule a new practice, or edit one (date, time, venue, notes, and who's invited). */
export function PracticeForm({
  action,
  initial,
  mode,
  minDate,
  cancelHref,
  audience = "MEMBERS",
  audienceChoices,
  levelChoices,
  members = [],
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: PracticeFormValues;
  mode: "schedule" | "edit";
  minDate?: string;
  cancelHref?: string;
  /** Who it's for. Fixed when editing, and for alumni organisers and batch leads. */
  audience?: PracticeAudience;
  /** When scheduling: the kinds of practice this person may choose between. */
  audienceChoices?: readonly PracticeAudience[];
  /** The levels that can be ticked (a batch lead only has their own). */
  levelChoices?: readonly StudyLevel[];
  /** Who can be picked for a chosen-members practice (admins). */
  members?: PickableMember[];
}) {
  const [state, formAction] = useActionState(action, idleState);
  const formRef = useRef<HTMLFormElement>(null);
  const saved = (state.values ?? {}) as Record<string, string>;
  const values = { ...initial, ...saved } as PracticeFormValues & Record<string, string>;
  const levels = listFrom(saved.levels ?? initial.levels);
  const memberIds = listFrom(saved.memberIds ?? initial.memberIds);
  const choices = audienceChoices && audienceChoices.length > 1 ? audienceChoices : null;
  const [chosen, setChosen] = useState<PracticeAudience>(
    (choices?.includes(saved.audience as PracticeAudience) ? saved.audience : audience) as PracticeAudience,
  );
  const errors = state.fieldErrors ?? {};
  const prefix = mode === "schedule" ? "schedule" : "edit";

  // A fresh form after scheduling, ready for the next practice.
  useEffect(() => {
    if (mode === "schedule" && state.status === "success") formRef.current?.reset();
  }, [mode, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3" key={JSON.stringify(state.values ?? {})} noValidate>
      <ActionFeedback state={state} />
      <input type="hidden" name="audience" value={chosen} />

      {choices ? (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-slate-700">Who is it for?</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {choices.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={chosen === choice}
                onClick={() => setChosen(choice)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                  chosen === choice
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-brand-400",
                )}
              >
                {PRACTICE_AUDIENCE_LABELS[choice]}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">{AUDIENCE_HINTS[chosen]}</p>
        </fieldset>
      ) : null}

      {chosen === "LEVELS" ? (
        levelChoices && levelChoices.length === 1 ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
            <input type="hidden" name="levels" value={levelChoices[0]} />
            For <strong>{STUDY_LEVEL_LABELS[levelChoices[0]!]}</strong> members. Only they see it on their dashboard.
          </p>
        ) : (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-slate-700">Levels</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {(levelChoices ?? []).map((level) => (
                <Checkbox
                  key={level}
                  name="levels"
                  value={level}
                  defaultChecked={levels.includes(level)}
                  label={STUDY_LEVEL_LABELS[level]}
                />
              ))}
            </div>
            {errors.levels?.length ? (
              <p className="text-xs font-medium text-red-600">{errors.levels.join(". ")}</p>
            ) : null}
          </fieldset>
        )
      ) : null}

      {chosen === "SELECTED" ? (
        <MemberPicker members={members} initial={memberIds} errors={errors.memberIds} prefix={prefix} />
      ) : null}

      <Field label="Date" htmlFor={`${prefix}-date`} errors={errors.date}>
        <Input id={`${prefix}-date`} name="date" type="date" defaultValue={values.date} min={minDate} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" htmlFor={`${prefix}-start`} errors={errors.startTime}>
          <Input id={`${prefix}-start`} name="startTime" type="time" defaultValue={values.startTime} required />
        </Field>
        <Field label="Ends (optional)" htmlFor={`${prefix}-end`} errors={errors.endTime}>
          <Input id={`${prefix}-end`} name="endTime" type="time" defaultValue={values.endTime} />
        </Field>
      </div>
      <Field label="Title" htmlFor={`${prefix}-title`} errors={errors.title}>
        <Input id={`${prefix}-title`} name="title" defaultValue={values.title} required />
      </Field>
      <Field
        label="Venue"
        htmlFor={`${prefix}-venue`}
        hint="Leave it as Tentative until the venue is booked"
        errors={errors.venue}
      >
        <Input id={`${prefix}-venue`} name="venue" defaultValue={values.venue} />
      </Field>
      <Field label="Notes for members (optional)" htmlFor={`${prefix}-notes`} errors={errors.notes}>
        <Textarea
          id={`${prefix}-notes`}
          name="notes"
          rows={2}
          defaultValue={values.notes}
          placeholder="e.g. Bring your folders"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          confirm={{
            title: (data) =>
              `${mode === "schedule" ? "Schedule" : "Save"} ${String(data.get("title") ?? "").trim() || "practice"} on ${describeDate(String(data.get("date") ?? ""))}?`,
            description: (data) =>
              mode === "schedule"
                ? scheduleDescription(chosen, data)
                : "Everyone invited sees the updated details straight away.",
            confirmLabel: mode === "schedule" ? "Schedule practice" : "Save changes",
          }}
        >
          {mode === "schedule" ? "Schedule practice" : "Save changes"}
        </SubmitButton>
        <CancelButton href={cancelHref} />
      </div>
    </form>
  );
}

function scheduleDescription(audience: PracticeAudience, data: FormData): string {
  const reply = "see it on their dashboard straight away and can say whether they're coming.";
  if (audience === "ALUMNI") return `Alumni ${reply}`;
  if (audience === "LEVELS") {
    const levels = data.getAll("levels").map((level) => STUDY_LEVEL_LABELS[level as StudyLevel] ?? String(level));
    return levels.length ? `Members in ${levels.join(", ")} ${reply}` : "Tick at least one level.";
  }
  if (audience === "SELECTED") {
    const count = data.getAll("memberIds").length;
    return count ? `The ${count} chosen ${count === 1 ? "member" : "members"} ${reply}` : "Pick at least one member.";
  }
  return `Members ${reply}`;
}

/** Search and tick members. Ticked members stay in the form while the search hides others. */
function MemberPicker({
  members,
  initial,
  errors,
  prefix,
}: {
  members: PickableMember[];
  initial: string[];
  errors?: string[];
  prefix: string;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => new Set(initial));
  const search = query.trim().toLowerCase();
  const matches = (member: PickableMember) =>
    !search || member.name.toLowerCase().includes(search) || member.detail.toLowerCase().includes(search);

  const toggle = (id: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <fieldset className="space-y-1.5">
      <legend className="flex w-full items-center justify-between text-sm font-medium text-slate-700">
        <span>Members</span>
        <span className="text-xs font-normal text-slate-500">{picked.size} chosen</span>
      </legend>
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name, level or voice"
        aria-label="Search members to invite"
        id={`${prefix}-member-search`}
        className="h-9"
      />
      <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {members.map((member) => (
          <li key={member.id} className={cn(!matches(member) && "hidden")}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                name="memberIds"
                value={member.id}
                checked={picked.has(member.id)}
                onChange={(event) => toggle(member.id, event.target.checked)}
                className="size-4 rounded border-slate-300 accent-brand-700"
              />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{member.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{member.detail}</span>
            </label>
          </li>
        ))}
      </ul>
      {errors?.length ? <p className="text-xs font-medium text-red-600">{errors.join(". ")}</p> : null}
    </fieldset>
  );
}
