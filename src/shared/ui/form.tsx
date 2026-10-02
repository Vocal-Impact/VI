import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

const control =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 " +
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100 aria-invalid:border-red-500";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "py-2", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-10 pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-sm font-medium text-slate-700", className)} {...props} />;
}

export function Checkbox({
  label,
  hint,
  className,
  ...props
}: ComponentProps<"input"> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cn("flex items-start gap-3 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 size-4 rounded border-slate-300 accent-brand-700" {...props} />
      <span>
        <span className="font-medium text-slate-800">{label}</span>
        {hint ? <span className="block text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Label + control + hint + error messages, wired with aria attributes. */
export function Field({
  label,
  htmlFor,
  hint,
  errors,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  errors?: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !errors?.length ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {errors?.length ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-red-600">
          {errors.join(". ")}
        </p>
      ) : null}
    </div>
  );
}
