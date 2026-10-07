"use client";

import { useActionState } from "react";
import { idleState } from "@/shared/lib/action-state";
import { SubmitButton } from "@/shared/ui/client";
import { Alert } from "@/shared/ui/layout";
import { runBirthdayRemindersAction } from "../actions";

export function RunRemindersButton() {
  const [state, formAction] = useActionState(runBirthdayRemindersAction, idleState);
  return (
    <form action={formAction} className="space-y-3">
      <SubmitButton
        variant="outline"
        pendingText="Running…"
        confirm={{
          title: "Send today's birthday reminders now?",
          description: "People who already got today's email won't get it twice.",
          confirmLabel: "Send now",
        }}
      >
        Run today&apos;s reminders now
      </SubmitButton>
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
    </form>
  );
}
