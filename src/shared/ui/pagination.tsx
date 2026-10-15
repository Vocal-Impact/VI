import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/**
 * Page numbers to show: the first, the last, and the current one with a
 * neighbour either side; "…" for the gaps. 1 … 4 5 6 … 12
 */
export function pageNumbers(page: number, pageCount: number): Array<number | "…"> {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: Array<number | "…"> = [];
  for (const [index, n] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && n - previous === 2) result.push(previous + 1);
    else if (previous !== undefined && n - previous > 2) result.push("…");
    result.push(n);
  }
  return result;
}

/**
 * "Showing 26–50 of 120" with Previous / page numbers / Next. Pages are links
 * (`hrefFor`), so they work without JavaScript and can be bookmarked.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  hrefFor,
  noun = "members",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
  noun?: string;
}) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const step = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium";

  return (
    <nav
      aria-label="Pages"
      className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:px-5"
    >
      <p className="text-sm text-slate-600">
        Showing <b>{first}</b>–<b>{last}</b> of <b>{total}</b> {noun}
      </p>
      {pageCount > 1 ? (
        <ul className="flex items-center gap-1">
          <li>
            {page > 1 ? (
              <Link href={hrefFor(page - 1)} className={cn(step, "text-slate-700 hover:bg-slate-100")} rel="prev">
                <ChevronLeft className="size-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
              </Link>
            ) : (
              <span className={cn(step, "text-slate-300")} aria-hidden="true">
                <ChevronLeft className="size-4" />
              </span>
            )}
          </li>
          {pageNumbers(page, pageCount).map((n, index) =>
            n === "…" ? (
              <li key={`gap-${index}`} className={cn(step, "text-slate-400")} aria-hidden="true">
                …
              </li>
            ) : (
              <li key={n}>
                <Link
                  href={hrefFor(n)}
                  aria-label={`Page ${n}`}
                  aria-current={n === page ? "page" : undefined}
                  className={cn(step, n === page ? "bg-ink text-white" : "text-slate-700 hover:bg-slate-100")}
                >
                  {n}
                </Link>
              </li>
            ),
          )}
          <li>
            {page < pageCount ? (
              <Link href={hrefFor(page + 1)} className={cn(step, "text-slate-700 hover:bg-slate-100")} rel="next">
                <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <span className={cn(step, "text-slate-300")} aria-hidden="true">
                <ChevronRight className="size-4" />
              </span>
            )}
          </li>
        </ul>
      ) : null}
    </nav>
  );
}
