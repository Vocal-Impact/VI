"use client";

import dynamic from "next/dynamic";
import { useActionState } from "react";
import type { LatLng } from "@/modules/carpool/domain";
import type { MapPerson } from "@/modules/carpool/ui";
import { idleState } from "@/shared/lib/action-state";
import { ActionFeedback, SubmitButton } from "@/shared/ui/client";
import { geocodePendingAction } from "./actions";

const CarpoolMap = dynamic(() => import("@/modules/carpool/ui/carpool-map"), {
  ssr: false,
  loading: () => <div className="h-[28rem] animate-pulse rounded-lg bg-slate-100" />,
});

export function MapClient(props: {
  venue: LatLng & { name: string };
  people: MapPerson[];
  lines: Array<{ points: LatLng[]; groupIndex: number }>;
}) {
  return <CarpoolMap {...props} />;
}

export function GeocodeButton({ pending }: { pending: number }) {
  const [state, formAction] = useActionState(geocodePendingAction, idleState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <SubmitButton size="sm" variant="secondary" pendingText="Locating (≈1 per second)…">
        Locate {pending} waiting area{pending === 1 ? "" : "s"}
      </SubmitButton>
      <ActionFeedback state={state} />
      {state.status === "success" ? <span className="text-sm text-slate-600">{state.message}</span> : null}
    </form>
  );
}
