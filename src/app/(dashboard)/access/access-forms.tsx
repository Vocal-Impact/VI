"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ACCESS_LEVELS, ACCESS_LEVEL_LABELS, ROLES, type AccessLevel } from "@/modules/auth/domain";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { cn } from "@/shared/lib/cn";
import { idleState, type ActionState } from "@/shared/lib/action-state";
import { ActionFeedback, SubmitButton } from "@/shared/ui/client";
import { Checkbox, Field, Input, Select } from "@/shared/ui/form";
import { Badge } from "@/shared/ui/layout";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const LEVEL_TONES = { ADMIN: "brand", COMMITTEE: "blue", NONE: "neutral" } as const;
const ROLE_LABELS = { ADMIN: "Admin", COMMITTEE: "Committee", MEMBER: "Member" } as const;

export function AccessBadge({ level }: { level: AccessLevel }) {
  return <Badge tone={LEVEL_TONES[level]}>{ACCESS_LEVEL_LABELS[level]}</Badge>;
}

export interface MemberAccessRow {
  memberId: string;
  name: string;
  email: string;
  voiceType: string;
  status: string;
  level: AccessLevel;
  receivesBirthdayReminders: boolean;
  hasSignedIn: boolean;
  isSelf: boolean;
}

/** One member: choose Member / Committee / Admin and birthday emails. */
export function MemberAccessForm({ row, action }: { row: MemberAccessRow; action: Action }) {
  const [state, formAction] = useActionState(action, idleState);
  const [level, setLevel] = useState<AccessLevel>(row.level);
  const changed = level !== row.level;

  return (
    <form action={formAction} className={cn("px-4 py-3 sm:px-5", row.level !== "NONE" && "bg-brand-50/40")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <Link href={`/members/${row.memberId}`} className="hover:text-brand-700 hover:underline">
              {row.name}
            </Link>
            <AccessBadge level={row.level} />
            {row.isSelf ? <Badge tone="brand">You</Badge> : null}
          </p>
          <p className="truncate text-xs text-slate-500">
            {row.email} · {VOICE_TYPE_LABELS[row.voiceType as VoiceType]} · {row.status.toLowerCase()}
            {row.level !== "NONE" ? ` · ${row.hasSignedIn ? "has signed in" : "not signed in yet"}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            name="level"
            value={level}
            onChange={(event) => setLevel(event.target.value as AccessLevel)}
            disabled={row.isSelf}
            aria-label={`Access for ${row.name}`}
            className="h-9 w-40"
          >
            {ACCESS_LEVELS.map((option) => (
              <option key={option} value={option}>
                {ACCESS_LEVEL_LABELS[option]}
              </option>
            ))}
          </Select>
          {level !== "NONE" ? (
            <Checkbox
              name="receivesBirthdayReminders"
              defaultChecked={row.receivesBirthdayReminders}
              label="Birthday emails"
              disabled={row.isSelf}
            />
          ) : null}
          <SubmitButton size="sm" variant={changed ? "primary" : "outline"} disabled={row.isSelf}>
            {row.level === "NONE" && level !== "NONE" ? "Give access" : "Save"}
          </SubmitButton>
        </div>
      </div>
      {row.isSelf ? <p className="mt-1 text-xs text-slate-500">Ask another admin to change your own access.</p> : null}
      <ActionFeedback state={state} />
    </form>
  );
}

/** Accounts not attached to a member (advisor, local admin…). */
export function AccountRow({
  action,
  account,
  isSelf,
}: {
  action: Action;
  isSelf: boolean;
  account: {
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
            {account.name} {isSelf ? <Badge tone="brand">You</Badge> : null}{" "}
            {!account.active ? <Badge tone="red">Disabled</Badge> : null}
          </p>
          <p className="text-xs text-slate-500">
            {account.email} · {account.hasSignedIn ? "has signed in" : "not signed in yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select name="role" defaultValue={account.role} aria-label={`Role for ${account.name}`} className="h-8 w-36">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
          <Checkbox
            name="receivesBirthdayReminders"
            defaultChecked={account.receivesBirthdayReminders}
            label="Birthday emails"
          />
          <Checkbox name="active" defaultChecked={account.active} label="Can sign in" />
          <SubmitButton size="sm" variant="outline">
            Save
          </SubmitButton>
        </div>
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}

export function NewAccountForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-3" key={state.status === "success" ? state.message : "form"}>
      <ActionFeedback state={state} />
      <Field label="Name" htmlFor="new-account-name" errors={state.fieldErrors?.name}>
        <Input id="new-account-name" name="name" defaultValue={state.values?.name ?? ""} required />
      </Field>
      <Field
        label="Google account email"
        htmlFor="new-account-email"
        hint="If a member has this email, the login is linked to them automatically."
        errors={state.fieldErrors?.email}
      >
        <Input id="new-account-email" name="email" type="email" defaultValue={state.values?.email ?? ""} required />
      </Field>
      <Field label="Role" htmlFor="new-account-role">
        <Select id="new-account-role" name="role" defaultValue={state.values?.role ?? "COMMITTEE"}>
          <option value="COMMITTEE">Committee</option>
          <option value="ADMIN">Admin</option>
        </Select>
      </Field>
      <SubmitButton className="w-full">Add account</SubmitButton>
    </form>
  );
}
