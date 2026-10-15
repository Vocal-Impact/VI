"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Keeps a card from growing without limit: shows the first `visible` items in
 * full and scrolls the rest inside the card. The height is measured from the
 * items themselves, so "4 practices" means exactly four, whatever their size.
 *
 * Items are the direct children, or the elements matching `items` (e.g.
 * "tbody > tr" for a table, whose header then sticks to the top).
 */
export function CappedList({
  visible,
  items,
  className,
  label,
  children,
}: {
  visible: number;
  items?: string;
  className?: string;
  /** Names the scrolling area for screen readers, e.g. "Upcoming practices". */
  label?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => {
      const list = Array.from(items ? container.querySelectorAll<HTMLElement>(items) : container.children);
      if (list.length <= visible) return setMaxHeight(null);
      const last = list[visible - 1]!.getBoundingClientRect();
      const next = list[visible]!.getBoundingClientRect();
      const top = container.getBoundingClientRect().top - container.scrollTop;
      const paddingBottom = parseFloat(getComputedStyle(container).paddingBottom) || 0;
      // End where the next item starts, so no sliver of it shows.
      setMaxHeight(Math.floor(last.bottom - top + Math.min(paddingBottom, next.top - last.bottom)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    // Watch the items too: their height changes with the width (wrapping) or their content.
    for (const element of [container, ...Array.from(container.children)]) observer.observe(element);
    return () => observer.disconnect();
  }, [items, visible, children]);

  const scrolls = maxHeight !== null;
  return (
    <div
      ref={ref}
      role={scrolls ? "region" : undefined}
      aria-label={scrolls ? label : undefined}
      // Focusable when it scrolls, so keyboard users can scroll it too.
      tabIndex={scrolls ? 0 : undefined}
      style={scrolls ? { maxHeight } : undefined}
      className={cn(
        // No overscroll-contain: once the list reaches its end, the page carries on scrolling
        // (so you don't have to move the pointer or finger outside the list to scroll the page).
        scrolls && "overflow-y-auto focus-visible:outline-2 focus-visible:outline-brand-600",
        items?.includes("tr") && "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-white",
        className,
      )}
    >
      {children}
    </div>
  );
}
