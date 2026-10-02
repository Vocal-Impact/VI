"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { ActionState } from "@/shared/lib/action-state";
import { Button } from "./button";
import { Alert } from "./layout";
import { Equalizer } from "./music";

/** Submit button that disables itself and shows progress while the form's action runs. */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <Equalizer className="h-3.5" bars={4} label="Working" />
          {pendingText ?? "Saving…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/** Shows a toast on success and an inline alert on error for a `useActionState` form. */
export function ActionFeedback({ state, inline = true }: { state: ActionState; inline?: boolean }) {
  const lastShown = useRef<ActionState | null>(null);
  useEffect(() => {
    if (state === lastShown.current) return;
    lastShown.current = state;
    if (state.status === "success" && state.message) toast.success(state.message);
  }, [state]);

  if (state.status === "error" && state.message && inline) {
    return <Alert tone="error">{state.message.replace(/\s*\(memberId:[^)]+\)/, "")}</Alert>;
  }
  return null;
}

/** A submit button that asks for confirmation first (for destructive actions). */
export function ConfirmSubmit({ message, children, ...props }: ComponentProps<typeof Button> & { message: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      {...props}
    >
      {pending ? "Working…" : children}
    </Button>
  );
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Copied to clipboard");
        } catch {
          toast.error("Could not copy — select and copy manually");
        }
      }}
    >
      {label}
    </Button>
  );
}
