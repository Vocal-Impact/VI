"use client";

import { useActionState } from "react";
import { ROLES } from "@/modules/auth/domain";
import { idleState, type ActionState } from "@/shared/lib/action-state";
import { ActionFeedback, SubmitButton } from "@/shared/ui/client";
import { Checkbox, Field, Input, Select } from "@/shared/ui/form";
import { Badge } from "@/shared/ui/layout";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const ROLE_LABELS = { ADMIN: "Admin", COMMITTEE: "Committee", MEMBER: "Member" } as const;

export function NewUserForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-3" key={state.status === "success" ? state.message : "form"}>
      <ActionFeedback state={state} />
      <Field label="Name" htmlFor="new-user-name" errors={state.fieldErrors?.name}>
        <Input id="new-user-name" name="name" defaultValue={state.values?.name ?? ""} required />
      </Field>
      <Field label="Email" htmlFor="new-user-email" errors={state.fieldErrors?.email}>
        <Input id="new-user-email" name="email" type="email" defaultValue={state.values?.email ?? ""} required />
      </Field>
      <Field label="Role" htmlFor="new-user-role">
        <Select id="new-user-role" name="role" defaultValue={state.values?.role ?? "COMMITTEE"}>
          {ROLES.filter((role) => role !== "MEMBER").map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton className="w-full">Add user</SubmitButton>
    </form>
  );
}

export function UserRow({
  action,
  user,
  isSelf,
}: {
  action: Action;
  isSelf: boolean;
  user: {
    name: string;
    email: string;
    role: string;
    active: boolean;
    receivesBirthdayReminders: boolean;
    hasSignedIn: boolean;
  };
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-2 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {user.name} {isSelf ? <Badge tone="brand">You</Badge> : null}{" "}
            {!user.active ? <Badge tone="red">Disabled</Badge> : null}
          </p>
          <p className="text-xs text-slate-500">
            {user.email} · {user.hasSignedIn ? "has signed in" : "not signed in yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select name="role" defaultValue={user.role} aria-label={`Role for ${user.name}`} className="h-8 w-36">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
          <Checkbox
            name="receivesBirthdayReminders"
            defaultChecked={user.receivesBirthdayReminders}
            label="Birthday emails"
          />
          <Checkbox name="active" defaultChecked={user.active} label="Can sign in" />
          <SubmitButton size="sm" variant="outline">
            Save
          </SubmitButton>
        </div>
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}
