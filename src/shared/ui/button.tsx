import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

// Primary/outline buttons echo the logo: hard offset "sticker" shadow that presses in on click.
const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-white shadow-sticker-brand hover:bg-ink-soft active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-brand-600",
  secondary: "bg-brand-100 text-brand-800 hover:bg-brand-200 focus-visible:outline-brand-700",
  outline:
    "border-2 border-ink bg-white text-ink shadow-sticker hover:bg-slate-50 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-ink",
  ghost: "text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-500",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-all duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
