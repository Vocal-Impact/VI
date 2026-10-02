"use client";

import dynamic from "next/dynamic";
import { useActionState, useState } from "react";
import { roundLatLng, type LatLng } from "@/modules/carpool/domain";
import { idleState, type ActionState } from "@/shared/lib/action-state";
import { ActionFeedback, ConfirmSubmit, SubmitButton } from "@/shared/ui/client";
import { Button } from "@/shared/ui/button";
import { Checkbox, Field, Input, Select } from "@/shared/ui/form";
import { Badge } from "@/shared/ui/layout";

const PinPicker = dynamic(() => import("@/modules/carpool/ui/pin-picker"), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-lg bg-slate-100" />,
});

interface LocationValue {
  areaLabel: string;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: string;
  canDrive: boolean;
  seats: number;
}

const GEOCODE_LABELS: Record<string, { label: string; tone: "green" | "amber" | "red" }> = {
  OK: { label: "On map", tone: "green" },
  PENDING: { label: "Waiting to be located", tone: "amber" },
  NOT_FOUND: { label: "Area not found — drop a pin", tone: "red" },
  FAILED: { label: "Locating failed — drop a pin", tone: "red" },
};

export function LocationForm({
  action,
  removeAction,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  removeAction?: () => Promise<void>;
  initial: LocationValue | null;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const [pin, setPin] = useState<LatLng | null>(
    initial?.latitude != null && initial.longitude != null
      ? { latitude: initial.latitude, longitude: initial.longitude }
      : null,
  );
  const [pinChanged, setPinChanged] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [canDrive, setCanDrive] = useState(initial?.canDrive ?? false);
  const status = initial ? GEOCODE_LABELS[initial.geocodeStatus] : undefined;

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <ActionFeedback state={state} />
        {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        <Field
          label="Area they live in"
          htmlFor="areaLabel"
          hint="e.g. Dehiwala, Nugegoda, Kandana"
          errors={state.fieldErrors?.areaLabel}
        >
          <Input id="areaLabel" name="areaLabel" defaultValue={initial?.areaLabel ?? ""} required />
        </Field>

        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowMap((value) => !value)}>
            {showMap ? "Hide map" : pin ? "Adjust pin on map" : "Drop a pin on the map (optional)"}
          </Button>
          {showMap ? (
            <div className="mt-2 space-y-1">
              <PinPicker
                value={pin}
                onChange={(point) => {
                  setPin(roundLatLng(point));
                  setPinChanged(true);
                }}
              />
              <p className="text-xs text-slate-500">
                Click roughly where they live. Stored to ~100 m, never an exact address.
              </p>
            </div>
          ) : null}
          {pin && pinChanged ? (
            <>
              <input type="hidden" name="latitude" value={pin.latitude} />
              <input type="hidden" name="longitude" value={pin.longitude} />
            </>
          ) : null}
        </div>

        <Checkbox
          name="canDrive"
          label="Can drive to practices"
          checked={canDrive}
          onChange={(event) => setCanDrive(event.target.checked)}
        />
        {canDrive ? (
          <Field label="Passenger seats" htmlFor="seats">
            <Select id="seats" name="seats" defaultValue={String(initial?.seats || 3)}>
              {[1, 2, 3, 4, 5, 6].map((seats) => (
                <option key={seats} value={seats}>
                  {seats}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="seats" value="0" />
        )}
        <Checkbox
          name="consentGiven"
          required
          defaultChecked={initial !== null}
          label="Member agreed to share their approximate location"
          hint="Only the committee can see it, for carpool planning."
        />
        {state.fieldErrors?.consentGiven ? (
          <p className="text-xs font-medium text-red-600">{state.fieldErrors.consentGiven[0]}</p>
        ) : null}
        <SubmitButton className="w-full">Save carpool details</SubmitButton>
      </form>

      {removeAction ? (
        <form action={removeAction}>
          <ConfirmSubmit
            variant="ghost"
            size="sm"
            className="w-full"
            message="Remove this member's location and carpool details?"
          >
            Remove location (consent withdrawn)
          </ConfirmSubmit>
        </form>
      ) : null}
    </div>
  );
}
