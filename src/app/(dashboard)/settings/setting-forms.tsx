"use client";

import { useActionState, type ReactNode } from "react";
import { idleState } from "@/shared/lib/action-state";
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
      description="Used as the carpool destination. Right-click the spot in Google Maps to copy its coordinates."
    >
      <Field label="Name" htmlFor="venue-name">
        <Input id="venue-name" name="name" defaultValue={value.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" htmlFor="venue-lat">
          <Input id="venue-lat" name="latitude" type="number" step="0.000001" defaultValue={value.latitude} />
        </Field>
        <Field label="Longitude" htmlFor="venue-lng">
          <Input id="venue-lng" name="longitude" type="number" step="0.000001" defaultValue={value.longitude} />
        </Field>
      </div>
    </SettingCard>
  );
}
