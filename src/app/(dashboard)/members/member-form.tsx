"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  MAX_DIETARY_PREFERENCE_LENGTH,
  MEMBER_STATUSES,
  MEMBER_STATUS_LABELS,
  STUDY_LEVELS,
  STUDY_LEVEL_LABELS,
  VOICE_TYPES,
  VOICE_TYPE_LABELS,
  type MemberStatus,
} from "@/modules/members/domain";
import { idleState, type ActionState } from "@/shared/lib/action-state";
import { Checkbox, Field, Input, Select } from "@/shared/ui/form";
import { Alert } from "@/shared/ui/layout";
import { SubmitButton } from "@/shared/ui/client";
import { LinkButton } from "@/shared/ui/button";

function fullNameFrom(data: FormData): string {
  return (
    `${String(data.get("firstName") ?? "").trim()} ${String(data.get("lastName") ?? "").trim()}`.trim() || "this member"
  );
}

export interface MemberFormValues {
  firstName: string;
  lastName: string;
  studentId: string;
  yearOfStudy: string;
  whatsappNumber: string;
  email: string;
  voiceType: string;
  dateOfBirth: string;
  dietaryPreference: string;
  /** Only used when adding a member (location is edited on the profile afterwards). */
  status?: string;
  areaLabel?: string;
  coordinates?: string;
  consentGiven?: string;
}

const EMPTY: MemberFormValues = {
  firstName: "",
  lastName: "",
  studentId: "",
  yearOfStudy: "",
  whatsappNumber: "",
  email: "",
  voiceType: "UNASSIGNED",
  dateOfBirth: "",
  dietaryPreference: "",
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
          <Select
            id="yearOfStudy"
            name="yearOfStudy"
            defaultValue={values.yearOfStudy}
            aria-invalid={!!errors.yearOfStudy}
          >
            <option value="" disabled>
              Choose…
            </option>
            {STUDY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {STUDY_LEVEL_LABELS[level]}
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
        <Field
          label="Dietary preferences (optional)"
          htmlFor="dietaryPreference"
          hint="e.g. Vegetarian, no beef, nut allergy. Stored encrypted."
          errors={errors.dietaryPreference}
        >
          <Input
            id="dietaryPreference"
            name="dietaryPreference"
            maxLength={MAX_DIETARY_PREFERENCE_LENGTH}
            defaultValue={values.dietaryPreference}
          />
        </Field>
        {mode === "create" ? (
          <Field
            label="Status"
            htmlFor="status"
            hint="New joiners are Prospective. Choose Active for an existing member already in the groups."
            errors={errors.status}
          >
            <Select id="status" name="status" defaultValue={values.status || "PROSPECTIVE"}>
              {MEMBER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {MEMBER_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      {mode === "create" ? (
        <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-800">Location for carpooling (optional)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Location (nearest landmark)"
              htmlFor="areaLabel"
              hint="e.g. Kohuwala junction. Coordinates are looked up automatically."
              errors={errors.areaLabel}
            >
              <Input id="areaLabel" name="areaLabel" maxLength={80} defaultValue={values.areaLabel ?? ""} />
            </Field>
            <Field
              label="Coordinates (optional)"
              htmlFor="coordinates"
              hint="If you have them: right-click the spot in Google Maps and click the numbers to copy."
              errors={errors.coordinates}
            >
              <Input
                id="coordinates"
                name="coordinates"
                inputMode="decimal"
                placeholder="6.8664, 79.8774"
                defaultValue={values.coordinates ?? ""}
              />
            </Field>
          </div>
          <Checkbox
            name="consentGiven"
            defaultChecked={values.consentGiven === "on"}
            label="Member agreed to share their approximate location"
            hint="Only the committee can see it, for carpool planning. Stored encrypted."
          />
          {errors.consentGiven ? <p className="text-xs font-medium text-red-600">{errors.consentGiven[0]}</p> : null}
        </fieldset>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <SubmitButton
          confirm={
            mode === "create"
              ? {
                  title: (data) => `Add ${fullNameFrom(data)}?`,
                  description: (data) =>
                    `They'll be added as ${MEMBER_STATUS_LABELS[(data.get("status") as MemberStatus) ?? "PROSPECTIVE"] ?? "Prospective"}${data.get("areaLabel") || data.get("coordinates") ? ", with their location for carpooling" : ""}.`,
                  confirmLabel: "Add member",
                }
              : {
                  title: (data) => `Save changes to ${fullNameFrom(data)}?`,
                  description: "Their profile is updated straight away.",
                  confirmLabel: "Save changes",
                }
          }
        >
          {mode === "create" ? "Save member" : "Save changes"}
        </SubmitButton>
        <LinkButton href={cancelHref} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
