"use client";

import Link from "next/link";
import { useActionState } from "react";
import { VOICE_TYPES, VOICE_TYPE_LABELS, formatYearOfStudy } from "@/modules/members/domain";
import { idleState, type ActionState } from "@/shared/lib/action-state";
import { Field, Input, Select } from "@/shared/ui/form";
import { Alert } from "@/shared/ui/layout";
import { SubmitButton } from "@/shared/ui/client";
import { LinkButton } from "@/shared/ui/button";

export interface MemberFormValues {
  firstName: string;
  lastName: string;
  studentId: string;
  yearOfStudy: string;
  whatsappNumber: string;
  email: string;
  voiceType: string;
  dateOfBirth: string;
}

const EMPTY: MemberFormValues = {
  firstName: "",
  lastName: "",
  studentId: "",
  yearOfStudy: "1",
  whatsappNumber: "",
  email: "",
  voiceType: "UNASSIGNED",
  dateOfBirth: "",
};

export function MemberForm({
  action,
  initial = EMPTY,
  mode,
  cancelHref,
  emailDomain,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: MemberFormValues;
  mode: "create" | "edit";
  cancelHref: string;
  emailDomain: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const values = { ...initial, ...(state.values ?? {}) } as MemberFormValues;
  const errors = state.fieldErrors ?? {};
  const duplicateId = state.message?.match(/memberId:([0-9a-f-]+)/)?.[1];
  // Re-mount inputs after a failed submit so they show the echoed values.
  const formKey = JSON.stringify(state.values ?? {});

  return (
    <form action={formAction} className="space-y-5" key={formKey} noValidate>
      {state.status === "error" ? (
        <Alert tone="error" title={duplicateId ? "This person already exists" : "Could not save"}>
          {duplicateId ? (
            <>
              A member with the same details is already registered.{" "}
              <Link href={`/members/${duplicateId}`} className="font-semibold underline">
                Open their profile
              </Link>
            </>
          ) : (
            state.message
          )}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" errors={errors.firstName}>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={values.firstName}
            required
            aria-invalid={!!errors.firstName}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName" errors={errors.lastName}>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={values.lastName}
            required
            aria-invalid={!!errors.lastName}
          />
        </Field>
        <Field label="IIT student ID" htmlFor="studentId" errors={errors.studentId}>
          <Input
            id="studentId"
            name="studentId"
            defaultValue={values.studentId}
            required
            aria-invalid={!!errors.studentId}
          />
        </Field>
        <Field label="Current year of study" htmlFor="yearOfStudy" errors={errors.yearOfStudy}>
          <Select id="yearOfStudy" name="yearOfStudy" defaultValue={values.yearOfStudy}>
            {[0, 1, 2, 3, 4, 5].map((year) => (
              <option key={year} value={year}>
                {formatYearOfStudy(year)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="WhatsApp number" htmlFor="whatsappNumber" hint="e.g. 077 123 4567" errors={errors.whatsappNumber}>
          <Input
            id="whatsappNumber"
            name="whatsappNumber"
            type="tel"
            inputMode="tel"
            defaultValue={values.whatsappNumber}
            required
            aria-invalid={!!errors.whatsappNumber}
          />
        </Field>
        <Field label="IIT email address" htmlFor="email" hint={`Must end with @${emailDomain}`} errors={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={values.email}
            required
            aria-invalid={!!errors.email}
          />
        </Field>
        <Field label="Voice type" htmlFor="voiceType" errors={errors.voiceType}>
          <Select id="voiceType" name="voiceType" defaultValue={values.voiceType}>
            {VOICE_TYPES.map((voiceType) => (
              <option key={voiceType} value={voiceType}>
                {VOICE_TYPE_LABELS[voiceType]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date of birth (optional)" htmlFor="dateOfBirth" errors={errors.dateOfBirth}>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={values.dateOfBirth} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <SubmitButton name="intent" value="save">
          {mode === "create" ? "Save member" : "Save changes"}
        </SubmitButton>
        {mode === "create" ? (
          <SubmitButton name="intent" value="invite" variant="secondary">
            Save &amp; send group invites
          </SubmitButton>
        ) : null}
        <LinkButton href={cancelHref} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
