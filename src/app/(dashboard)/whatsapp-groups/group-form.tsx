"use client";

import { useActionState, useState } from "react";
import { VOICE_TYPE_LABELS, type VoiceType } from "@/modules/members/domain";
import { idleState, type ActionState } from "@/shared/lib/action-state";
import { cn } from "@/shared/lib/cn";
import { ActionFeedback, SubmitButton } from "@/shared/ui/client";
import { Checkbox, Field, Input } from "@/shared/ui/form";
import { createGroupAction, updateGroupAction } from "./actions";

const PARTS = ["SOPRANO", "ALTO", "TENOR", "BASS"] as const;

interface GroupValues {
  id: string;
  name: string;
  description: string | null;
  inviteLink: string;
  requiresEligibility: boolean;
  isMainGroup: boolean;
  allowedVoiceTypes: string[];
}

type GroupFormState = ActionState & { submissions?: number };

export function GroupForm({ group }: { group?: GroupValues }) {
  const action = group ? updateGroupAction.bind(null, group.id) : createGroupAction;
  const [state, formAction] = useActionState(
    async (prev: GroupFormState, formData: FormData): Promise<GroupFormState> => ({
      ...(await action(prev, formData)),
      submissions: (prev.submissions ?? 0) + 1,
    }),
    idleState as GroupFormState,
  );
  const values = state.values;
  const prefix = group ? `group-${group.id}` : "new-group";
  const initialParts = values?.allowedVoiceTypes
    ? values.allowedVoiceTypes.split(",").filter(Boolean)
    : (group?.allowedVoiceTypes ?? []);
  // New key after every submission: fresh empty form after a create, echoed values after an error.
  const formKey = `${state.submissions ?? 0}-${JSON.stringify(values ?? {})}`;

  return (
    <form action={formAction} className="space-y-3" key={formKey}>
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

      <PartsPicker prefix={prefix} initialParts={initialParts} />

      <Checkbox
        name="requiresEligibility"
        defaultChecked={values ? values.requiresEligibility === "on" : (group?.requiresEligibility ?? true)}
        label="New members only after the required practices"
        hint="Applies to prospective members only. Untick for groups they can join straight away."
      />
      <Checkbox
        name="isMainGroup"
        defaultChecked={values ? values.isMainGroup === "on" : (group?.isMainGroup ?? false)}
        label="Main group"
        hint="Marking someone as joined makes them an Active member."
      />
      <SubmitButton
        variant={group ? "outline" : "primary"}
        className="w-full"
        confirm={{
          title: (data) =>
            `${group ? "Save" : "Add"} the group “${String(data.get("name") ?? "").trim() || "untitled"}”?`,
          description: group
            ? "Invites sent from now on use these details."
            : "It becomes available for invites straight away.",
          confirmLabel: group ? "Save group" : "Add group",
        }}
      >
        {group ? "Save group" : "Add group"}
      </SubmitButton>
    </form>
  );
}

/** "All parts" or a chosen set of parts; posts them as one hidden field ("TENOR,BASS"). */
function PartsPicker({ prefix, initialParts }: { prefix: string; initialParts: string[] }) {
  const [parts, setParts] = useState<string[]>(initialParts);
  const [onlySomeParts, setOnlySomeParts] = useState(initialParts.length > 0);
  const togglePart = (part: string) =>
    setParts((current) => (current.includes(part) ? current.filter((p) => p !== part) : [...current, part]));

  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">Which parts can join?</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={`${prefix}-parts-mode`}
          className="size-4 accent-brand-700"
          checked={!onlySomeParts}
          onChange={() => setOnlySomeParts(false)}
        />
        All parts
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={`${prefix}-parts-mode`}
          className="size-4 accent-brand-700"
          checked={onlySomeParts}
          onChange={() => setOnlySomeParts(true)}
        />
        Only some parts (e.g. a Tenors group)
      </label>
      {onlySomeParts ? (
        <div className="flex flex-wrap gap-2 pl-6" role="group" aria-label="Parts allowed">
          {PARTS.map((part) => (
            <button
              key={part}
              type="button"
              aria-pressed={parts.includes(part)}
              onClick={() => togglePart(part)}
              className={cn(
                "rounded-full border-2 px-3 py-1 text-sm font-semibold transition-colors",
                parts.includes(part)
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
              )}
            >
              {VOICE_TYPE_LABELS[part as VoiceType]}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-slate-500">
        Admins can still add someone from another part (e.g. a committee member).
      </p>
      <input type="hidden" name="allowedVoiceTypes" value={onlySomeParts ? parts.join(",") : ""} />
    </fieldset>
  );
}
