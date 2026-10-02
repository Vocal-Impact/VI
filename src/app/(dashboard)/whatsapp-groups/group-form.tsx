"use client";

import { useActionState, useEffect, useRef } from "react";
import { idleState } from "@/shared/lib/action-state";
import { ActionFeedback, SubmitButton } from "@/shared/ui/client";
import { Checkbox, Field, Input } from "@/shared/ui/form";
import { createGroupAction, updateGroupAction } from "./actions";

interface GroupValues {
  id: string;
  name: string;
  description: string | null;
  inviteLink: string;
  requiresEligibility: boolean;
  isMainGroup: boolean;
}

export function GroupForm({ group }: { group?: GroupValues }) {
  const action = group ? updateGroupAction.bind(null, group.id) : createGroupAction;
  const [state, formAction] = useActionState(action, idleState);
  const values = state.values;
  const prefix = group ? `group-${group.id}` : "new-group";
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the "Add a group" form after a successful create.
  useEffect(() => {
    if (!group && state.status === "success") formRef.current?.reset();
  }, [group, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3" key={JSON.stringify(values ?? {})}>
      <ActionFeedback state={state} />
      <Field label="Group name" htmlFor={`${prefix}-name`} errors={state.fieldErrors?.name}>
        <Input
          id={`${prefix}-name`}
          name="name"
          defaultValue={values?.name ?? group?.name ?? ""}
          placeholder="VI Main"
          required
        />
      </Field>
      <Field label="Invite link" htmlFor={`${prefix}-link`} errors={state.fieldErrors?.inviteLink}>
        <Input
          id={`${prefix}-link`}
          name="inviteLink"
          type="url"
          defaultValue={values?.inviteLink ?? group?.inviteLink ?? ""}
          placeholder="https://chat.whatsapp.com/…"
          required
        />
      </Field>
      <Field label="Description (optional)" htmlFor={`${prefix}-description`}>
        <Input
          id={`${prefix}-description`}
          name="description"
          defaultValue={values?.description ?? group?.description ?? ""}
        />
      </Field>
      <Checkbox
        name="requiresEligibility"
        defaultChecked={values ? values.requiresEligibility === "on" : (group?.requiresEligibility ?? true)}
        label="Only after the required practices"
        hint="Untick for groups new members can join straight away."
      />
      <Checkbox
        name="isMainGroup"
        defaultChecked={values ? values.isMainGroup === "on" : (group?.isMainGroup ?? false)}
        label="Main group"
        hint="Marking someone as joined makes them an Active member."
      />
      <SubmitButton variant={group ? "outline" : "primary"} className="w-full">
        {group ? "Save group" : "Add group"}
      </SubmitButton>
    </form>
  );
}
