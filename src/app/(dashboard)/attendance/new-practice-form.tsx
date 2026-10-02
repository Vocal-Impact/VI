"use client";

import { useActionState } from "react";
import { idleState } from "@/shared/lib/action-state";
import { ActionFeedback, SubmitButton } from "@/shared/ui/client";
import { Field, Input } from "@/shared/ui/form";
import { createPracticeAction } from "./actions";

export function NewPracticeForm({ today }: { today: string }) {
  const [state, formAction] = useActionState(createPracticeAction, idleState);
  return (
    <form action={formAction} className="space-y-3">
      <ActionFeedback state={state} />
      <Field label="Date" htmlFor="date" errors={state.fieldErrors?.date}>
        <Input id="date" name="date" type="date" defaultValue={state.values?.date ?? today} max={today} required />
      </Field>
      <Field label="Title" htmlFor="title" errors={state.fieldErrors?.title}>
        <Input id="title" name="title" defaultValue={state.values?.title ?? "Practice"} required />
      </Field>
      <Field label="Venue (optional)" htmlFor="venue">
        <Input id="venue" name="venue" defaultValue={state.values?.venue ?? ""} />
      </Field>
      <SubmitButton variant="outline" className="w-full">
        Create practice
      </SubmitButton>
    </form>
  );
}
