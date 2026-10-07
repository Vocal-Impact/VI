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
  className,
}: {
  title: string;
  description?: string;
  settingKey: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(updateSettingAction, idleState);
  return (
    <Card className={className}>
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

export function VenueRequestSetting({
  value,
}: {
  value: { to: string[]; cc: string[]; subject: string; body: string };
}) {
  return (
    <SettingCard
      settingKey="venueRequestTemplate"
      className="lg:col-span-2"
      title="Venue request email"
      description="When a practice is scheduled, admins get an email with a button that opens this request as a draft in their own Gmail, ready to send to the IIT administration. Placeholders: {date}, {time}, {venue}, {title}, {expected}, {senderName}."
    >
      <Field label="To" htmlFor="venueRequestTo" hint="One or more addresses, separated by commas.">
        <Input id="venueRequestTo" name="to" defaultValue={value.to.join(", ")} placeholder="facilities@iit.ac.lk" />
      </Field>
      <Field label="Cc (optional)" htmlFor="venueRequestCc">
        <Input id="venueRequestCc" name="cc" defaultValue={value.cc.join(", ")} />
      </Field>
      <Field label="Subject" htmlFor="venueRequestSubject">
        <Input id="venueRequestSubject" name="subject" defaultValue={value.subject} required />
      </Field>
      <Field
        label="Message"
        htmlFor="venueRequestBody"
        hint="Plain text: Gmail drafts opened from a link can't carry bold or colours, but line breaks and links are kept."
      >
        <Textarea id="venueRequestBody" name="body" rows={16} defaultValue={value.body} required />
      </Field>
    </SettingCard>
  );
}
