import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";

/** Equaliser bars — the app's loading indicator. Pass `label={null}` when purely decorative. */
export function Equalizer({
  className,
  bars = 5,
  label = "Loading",
}: {
  className?: string;
  bars?: number;
  label?: string | null;
}) {
  const a11y = label === null ? { "aria-hidden": true as const } : { role: "status", "aria-label": label };
  return (
    <span {...a11y} className={cn("inline-flex h-5 items-end gap-[3px]", className)}>
      {Array.from({ length: bars }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="block h-full w-[3px] origin-bottom animate-eq rounded-full bg-current"
          style={{ animationDelay: `${(index * 137) % 600}ms` } as CSSProperties}
        />
      ))}
    </span>
  );
}

/** Full-area loader: "Tuning up…" with equaliser bars. */
export function TuningUp({ message = "Tuning up…" }: { message?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-brand-700">
      <Equalizer className="h-10" bars={7} />
      <p className="font-display text-sm font-semibold tracking-wide text-slate-500 uppercase">{message}</p>
    </div>
  );
}

const NOTES = ["♪", "♫", "♩", "♬"];

/** Decorative notes drifting upward (hidden from screen readers, calmed by reduced-motion). */
export function FloatingNotes({ count = 10, className }: { count?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="absolute animate-note-float text-2xl"
          style={{
            left: `${(index * 37) % 95}%`,
            bottom: `${(index * 23) % 40}%`,
            animationDelay: `${(index * 0.9) % 9}s`,
            fontSize: `${1 + ((index * 7) % 5) / 4}rem`,
          }}
        >
          {NOTES[index % NOTES.length]}
        </span>
      ))}
    </div>
  );
}

export function LogoWordmark({
  variant = "black",
  className,
  priority,
}: {
  variant?: "black" | "white";
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={`/brand/logo-primary-${variant}.png`}
      alt="Vocal Impact"
      width={640}
      height={294}
      priority={priority}
      className={cn("h-auto", className)}
    />
  );
}

export function LogoMark({ variant = "black", className }: { variant?: "black" | "white"; className?: string }) {
  return (
    <Image
      src={`/brand/logo-mark-${variant}.png`}
      alt=""
      width={256}
      height={237}
      className={cn("h-auto", className)}
    />
  );
}
