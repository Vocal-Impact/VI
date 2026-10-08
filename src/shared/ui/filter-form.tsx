"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

/** Wait this long after the last keystroke before searching. */
const TYPING_DELAY_MS = 300;

/**
 * A search/filter form that applies itself: results update while you type
 * (shortly after the last keystroke) and as soon as a dropdown changes, by
 * updating the page's query string. Enter still works. Empty fields are left
 * out of the URL.
 */
export function FilterForm({ className, children, ...props }: Omit<ComponentProps<"form">, "onSubmit" | "onChange">) {
  const router = useRouter();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  function queryFromForm(): string | null {
    if (!form.current) return null;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form.current)) {
      if (typeof value === "string" && value.trim() !== "") params.set(key, value.trim());
    }
    return params.toString();
  }

  function apply() {
    const query = queryFromForm();
    if (query === null) return;
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  useEffect(() => {
    // Anything typed before the page finished loading didn't trigger onChange: apply it now.
    const current = new URLSearchParams(window.location.search);
    const typedEarly = [...(form.current?.querySelectorAll("input") ?? [])].some(
      (input) => input.name && input.type !== "checkbox" && input.value.trim() !== (current.get(input.name) ?? ""),
    );
    if (typedEarly) apply();
    return () => clearTimeout(timer.current);
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      ref={form}
      role="search"
      aria-busy={pending}
      className={cn(className, pending && "[&_input]:opacity-80")}
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        apply();
      }}
      onChange={(event) => {
        clearTimeout(timer.current);
        // Typing waits for a pause; dropdowns apply straight away.
        const typing = event.target instanceof HTMLInputElement && event.target.type !== "checkbox";
        timer.current = setTimeout(apply, typing ? TYPING_DELAY_MS : 0);
      }}
      {...props}
    >
      {children}
    </form>
  );
}
