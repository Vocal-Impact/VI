"use client";

import { useEffect, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { ActionState } from "@/shared/lib/action-state";
import { Button } from "./button";
import { Alert } from "./layout";
import { Equalizer } from "./music";
import { ConfirmDialog, resolveConfirm, type ConfirmContent, type FormConfirmOptions } from "./confirm";

export { useConfirm, type ConfirmContent, type FormConfirmOptions } from "./confirm";

/**
 * Submit button that disables itself and shows progress while the form's
 * action runs. With `confirm`, it first asks in a dialog; the form is only
 * submitted after "Confirm" (browser validation still runs first).
 */
export function SubmitButton({
  children,
  pendingText,
  confirm,
  onClick,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: ReactNode; confirm?: FormConfirmOptions }) {
  const { pending } = useFormStatus();
  const button = useRef<HTMLButtonElement>(null);
  const approved = useRef(false);
  const [asking, setAsking] = useState<ConfirmContent | null>(null);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || !confirm) return;
    if (approved.current) {
      approved.current = false; // confirmed: let this click submit
      return;
    }
    event.preventDefault();
    const form = event.currentTarget.form;
    if (form && !form.noValidate && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setAsking(resolveConfirm(confirm, form ? new FormData(form, event.currentTarget) : new FormData()));
  }

  return (
    <>
      <Button
        ref={button}
        type="submit"
        disabled={pending || props.disabled}
        aria-busy={pending}
        onClick={handleClick}
        {...props}
      >
        {pending ? (
          <>
            <Equalizer className="h-3.5" bars={4} label="Working" />
            {pendingText ?? "Saving…"}
          </>
        ) : (
          children
        )}
      </Button>
      {asking ? (
        <ConfirmDialog
          content={asking}
          onResult={(ok) => {
            setAsking(null);
            if (!ok) return;
            approved.current = true;
            // Click again once the dialog has closed, so the form submits with this button as the submitter.
            setTimeout(() => button.current?.click(), 0);
          }}
        />
      ) : null}
    </>
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
/** A submit button that always asks first, styled for deletes and other actions that can't be undone. */
export function ConfirmSubmit({
  confirm,
  ...props
}: Omit<ComponentProps<typeof SubmitButton>, "confirm"> & { confirm: FormConfirmOptions }) {
  return <SubmitButton pendingText="Working…" confirm={{ tone: "danger", ...confirm }} {...props} />;
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
