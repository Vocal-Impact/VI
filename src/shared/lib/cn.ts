import { extendTailwindMerge } from "tailwind-merge";

/** Knows this app's custom theme values, so e.g. shadow-sticker is merged as a shadow, not a colour. */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["sticker", "sticker-brand"],
      font: ["display"],
      animate: ["eq", "note-float", "pop", "fade-up", "pulse-ring"],
    },
  },
});

/**
 * Joins class names, skipping falsy values. Later Tailwind classes win over
 * earlier ones that set the same thing, so `<Select className="w-40">`
 * replaces the component's own `w-full`.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return merge(classes.filter(Boolean).join(" "));
}
