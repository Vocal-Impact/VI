"use client";

import { useActionState, useEffect, useRef } from "react";
import { idleState, type ActionState } from "@/shared/lib/action-state";
import { ActionFeedback, SubmitButton } from "@/shared/ui/client";
import { LinkButton } from "@/shared/ui/button";
import { Field, Input, Textarea } from "@/shared/ui/form";

export interface PracticeFormValues {
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  venue: string;
  notes: string;
}

/** Schedule a new practice, or edit one (date, time, venue, notes). */
export function PracticeForm({
  action,
  initial,
  mode,
  minDate,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: PracticeFormValues;
  mode: "schedule" | "edit";
  minDate?: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const formRef = useRef<HTMLFormElement>(null);
  const values = { ...initial, ...(state.values ?? {}) } as PracticeFormValues;
  const errors = state.fieldErrors ?? {};
  const prefix = mode === "schedule" ? "schedule" : "edit";

  // A fresh form after scheduling, ready for the next practice.
  useEffect(() => {
    if (mode === "schedule" && state.status === "success") formRef.current?.reset();
  }, [mode, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3" key={JSON.stringify(state.values ?? {})} noValidate>
      <ActionFeedback state={state} />
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
      <Field label="Venue" htmlFor={`${prefix}-venue`} hint="Leave blank to use the usual venue" errors={errors.venue}>
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
        <SubmitButton className={mode === "schedule" ? "w-full" : undefined}>
          {mode === "schedule" ? "Schedule practice" : "Save changes"}
        </SubmitButton>
        {cancelHref ? (
          <LinkButton href={cancelHref} variant="ghost">
            Cancel
          </LinkButton>
        ) : null}
      </div>
    </form>
  );
}
