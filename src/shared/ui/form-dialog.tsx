"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "./button";

interface FormDialogContext {
  close: () => void;
}

const Context = createContext<FormDialogContext | null>(null);

/** Inside a FormDialog: close it (e.g. a Cancel button). Null when the form is on a page of its own. */
export function useFormDialog(): FormDialogContext | null {
  return useContext(Context);
}

/**
 * The one way to add things (a member, a practice, a WhatsApp group): a button
 * that opens the form over the page. Saving shows a toast and closes it (see
 * ActionFeedback); Esc, the X or the dimmed backdrop close it without saving.
 * The form is added to the page when first opened and then kept, so closing
 * it by accident doesn't lose what was typed.
 *
 * `openParam` opens it straight away when the URL has `?<openParam>=1`, so
 * other pages can link to it (e.g. the dashboard's "Schedule" button).
 */
export function FormDialog({
  label,
  title,
  description,
  children,
  openParam = "new",
  size = "md",
  buttonVariant = "primary",
  buttonSize = "md",
}: {
  /** The button's text, e.g. "Add member". */
  label: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  openParam?: string;
  /** "lg" for long forms (adding a member). */
  size?: "md" | "lg";
  buttonVariant?: "primary" | "outline" | "secondary";
  buttonSize?: "sm" | "md";
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(() => searchParams.get(openParam) === "1");
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    // Opened from a link (?new=1)? Drop it, so a refresh doesn't open it again.
    if (new URLSearchParams(window.location.search).has(openParam)) {
      const params = new URLSearchParams(window.location.search);
      params.delete(openParam);
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    }
  }, [openParam, pathname]);

  return (
    <>
      <Button variant={buttonVariant} size={buttonSize} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        // Close on a click that starts and ends on the backdrop (not when selecting text out of a field).
        onMouseDown={(event) => {
          pressedOnBackdrop.current = event.target === ref.current;
        }}
        onClick={(event) => {
          if (pressedOnBackdrop.current && event.target === ref.current) close();
          pressedOnBackdrop.current = false;
        }}
        className={cn(
          "m-auto max-h-[92dvh] w-[min(var(--dialog-width),calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-left shadow-2xl backdrop:bg-ink/60 backdrop:backdrop-blur-[2px] open:flex open:backdrop:animate-fade-in sm:open:animate-dialog-in",
          // Phones: a sheet that slides up from the bottom of the screen.
          "max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:open:animate-sheet-in",
          size === "lg" ? "[--dialog-width:48rem]" : "[--dialog-width:32rem]",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg leading-snug font-black text-ink">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-slate-600">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={close}
            className="-m-1 shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-ink"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          <Context.Provider value={{ close }}>{opened ? children : null}</Context.Provider>
        </div>
      </dialog>
    </>
  );
}
