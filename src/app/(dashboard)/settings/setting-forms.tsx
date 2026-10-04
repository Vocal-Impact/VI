"use client";

import { useActionState, type ReactNode } from "react";
import { idleState } from "@/shared/lib/action-state";
import { formatCoordinates } from "@/shared/lib/coordinates";
import { ActionFeedback, SubmitButton } from "@/shared/ui/client";
import { Field, Input, Textarea } from "@/shared/ui/form";
import { Card, CardBody, CardHeader } from "@/shared/ui/layout";
import { updateSettingAction } from "./actions";

function SettingCard({
  title,
  description,
  settingKey,
  children,
}: {
  title: string;
  description?: string;
  settingKey: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(updateSettingAction, idleState);
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <form action={formAction} className="space-y-3">
          <ActionFeedback state={state} />
          <input type="hidden" name="key" value={settingKey} />
          {children}
          {state.fieldErrors ? (
            <p className="text-xs font-medium text-red-600">{Object.values(state.fieldErrors).flat().join(". ")}</p>
          ) : null}
          <SubmitButton size="sm">Save</SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}

export function NumberSetting({
  settingKey,
  title,
  description,
  value,
  step = 1,
  min,
  max,
}: {
  settingKey: string;
  title: string;
  description?: string;
  value: number;
  step?: number;
  min: number;
  max: number;
}) {
  return (
    <SettingCard title={title} description={description} settingKey={settingKey}>
      <Input
        name="value"
        type="number"
        defaultValue={value}
        step={step}
        min={min}
        max={max}
        aria-label={title}
        className="max-w-32"
      />
    </SettingCard>
  );
}

export function TemplateSetting({ value }: { value: string }) {
  return (
    <SettingCard
      settingKey="inviteMessageTemplate"
      title="WhatsApp invite message"
      description="Placeholders: {firstName}, {lastName}, {groupList} (required)."
    >
      <Textarea name="value" rows={6} defaultValue={value} aria-label="Invite message template" />
    </SettingCard>
  );
}

export function VenueSetting({ value }: { value: { name: string; latitude: number; longitude: number } }) {
  return (
    <SettingCard
      settingKey="practiceVenue"
      title="Practice venue"
      description="Where lifts home start from, and the default venue for new practices."
    >
      <Field label="Name" htmlFor="venue-name">
        <Input id="venue-name" name="name" defaultValue={value.name} />
      </Field>
      <Field
        label="Coordinates"
        htmlFor="venue-coordinates"
        hint="In Google Maps, right-click the spot and click the numbers at the top to copy them, then paste here."
      >
        <Input
          id="venue-coordinates"
          name="coordinates"
          inputMode="decimal"
          placeholder="6.8953861, 79.8556737"
          defaultValue={formatCoordinates(value)}
        />
      </Field>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${value.latitude},${value.longitude}`}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-xs text-brand-700 hover:underline"
      >
        Check the current location in Google Maps ↗
      </a>
    </SettingCard>
  );
}
