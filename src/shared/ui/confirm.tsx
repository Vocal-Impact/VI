"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "./button";

/**
 * One confirmation dialog for every create, update and delete in the app.
 *
 * - Form buttons: `<SubmitButton confirm={{ title: "Delete this practice?" }}>`
 *   (see client.tsx). In client components the title and description can be
 *   functions of the form's current values, e.g. `(data) => \`Add ${data.get("firstName")}?\``.
 * - Code that runs on a click: `const { confirm, dialog } = useConfirm();`
 *   then `if (await confirm({ ... })) …` and render `{dialog}`.
 */

export type ConfirmTone = "primary" | "danger";

export interface ConfirmContent {
  title: ReactNode;
  description?: ReactNode;
  /** Label of the confirm button, e.g. "Delete practice". Defaults to "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for deletes and anything that can't be undone. */
  tone?: ConfirmTone;
}

/** For form buttons: text can depend on what's been typed into the form. */
export type FormConfirmOptions = Omit<ConfirmContent, "title" | "description"> & {
  title: ReactNode | ((data: FormData) => ReactNode);
  description?: ReactNode | ((data: FormData) => ReactNode);
};

export function resolveConfirm(options: FormConfirmOptions, data: FormData): ConfirmContent {
  const pick = (value: ReactNode | ((data: FormData) => ReactNode)) =>
    typeof value === "function" ? value(data) : value;
  return { ...options, title: pick(options.title), description: pick(options.description) };
}

export function ConfirmDialog({
  content,
  onResult,
}: {
  content: ConfirmContent;
  onResult: (confirmed: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const danger = content.tone === "danger";

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={content.description ? descriptionId : undefined}
      // Esc closes it as "cancel".
      onCancel={(event) => {
        event.preventDefault();
        onResult(false);
      }}
      // Clicking the dimmed backdrop cancels too.
      onClick={(event) => {
        if (event.target === ref.current) onResult(false);
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] animate-pop rounded-2xl border border-slate-200 bg-white p-0 text-left shadow-2xl backdrop:bg-ink/60 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex gap-4 p-5 sm:p-6">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            danger ? "bg-red-100 text-red-600" : "bg-brand-100 text-brand-700",
          )}
          aria-hidden="true"
        >
          {danger ? <AlertTriangle className="size-5" /> : <HelpCircle className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display text-lg leading-snug font-black text-ink">
            {content.title}
          </h2>
          {content.description ? (
            <div id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {content.description}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
        <Button variant="ghost" onClick={() => onResult(false)}>
          {content.cancelLabel ?? "Cancel"}
        </Button>
        <Button variant={danger ? "danger" : "primary"} autoFocus onClick={() => onResult(true)}>
          {content.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </dialog>
  );
}

/** Ask before running code: `if (await confirm({ title: "Email 5 people?" })) send();` */
export function useConfirm() {
  const [pending, setPending] = useState<{ content: ConfirmContent; resolve: (ok: boolean) => void } | null>(null);
  const confirm = useCallback(
    (content: ConfirmContent) => new Promise<boolean>((resolve) => setPending({ content, resolve })),
    [],
  );
  const dialog = pending ? (
    <ConfirmDialog
      content={pending.content}
      onResult={(ok) => {
        pending.resolve(ok);
        setPending(null);
      }}
    />
  ) : null;
  return { confirm, dialog };
}
