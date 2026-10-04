"use client";

import { useActionState } from "react";
import { idleState } from "@/shared/lib/action-state";
import { SubmitButton } from "@/shared/ui/client";
import { Alert } from "@/shared/ui/layout";
import { sendTestEmailAction } from "../actions";

export function TestEmailButton() {
  const [state, formAction] = useActionState(sendTestEmailAction, idleState);
  return (
    <form action={formAction} className="space-y-3">
      <SubmitButton variant="outline" pendingText="Sending…">
        Send me a test email
      </SubmitButton>
      {state.status !== "idle" ? (
        <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>
      ) : null}
    </form>
  );
}
