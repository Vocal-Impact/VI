"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { cn } from "@/shared/lib/cn";
import { TuningUp } from "@/shared/ui/music";

/** pdf.js runtime files, copied into public/ on install (scripts/copy-pdfjs-assets.mjs). */
const ASSETS = "/pdfjs";
const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 2.5] as const;

/**
 * Sheet music viewer. Draws the PDF with pdf.js (the legacy build, so older
 * iPhones work too), the same on every phone and computer: browsers' own PDF
 * viewers show only the first page or download the file on many phones.
 * Pages are drawn as they scroll into view; zoom 1 = page fits the width.
 */
export function PdfViewer({
  src,
  title,
  downloadHref,
  className,
}: {
  /** Same-origin link that redirects to the stored PDF. */
  src: string;
  title: string;
  downloadHref?: string;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = `${ASSETS}/pdf.worker.min.mjs`;
        task = pdfjs.getDocument({
          url: src,
          standardFontDataUrl: `${ASSETS}/standard_fonts/`,
          cMapUrl: `${ASSETS}/cmaps/`,
          cMapPacked: true,
          wasmUrl: `${ASSETS}/wasm/`,
          // JavaScript image decoders instead of WebAssembly, which the site's security policy blocks.
          useWasm: false,
        });
        const loaded = await task.promise;
        if (!cancelled) setDoc(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      // Stops the download and the worker.
      void task?.destroy();
    };
  }, [src]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Ignore tiny changes (a scrollbar appearing) so pages aren't redrawn for nothing.
      const next = Math.floor(entry.contentRect.width);
      setWidth((current) => (Math.abs(current - next) > 8 ? next : current));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoomIndex = ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]);
  const toolbarButton =
    "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40";

  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-slate-100", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
        <span className="px-1 text-sm text-slate-500">
          {doc ? `${doc.numPages} page${doc.numPages === 1 ? "" : "s"}` : "Sheet music"}
        </span>
        <span className="ml-auto" />
        <button
          type="button"
          className={toolbarButton}
          onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)] ?? 1)}
          disabled={zoomIndex <= 0}
          aria-label="Zoom out"
        >
          <ZoomOut className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => setZoom(1)}
          disabled={zoom === 1}
          aria-label="Fit to width"
        >
          <Maximize2 className="size-4" aria-hidden="true" />
          <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)] ?? 1)}
          disabled={zoomIndex >= ZOOMS.length - 1}
          aria-label="Zoom in"
        >
          <ZoomIn className="size-4" aria-hidden="true" />
        </button>
        <a href={src} target="_blank" rel="noopener" className={toolbarButton}>
          <ExternalLink className="size-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Open</span>
        </a>
        {downloadHref ? (
          <a href={downloadHref} className={toolbarButton}>
            <Download className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Download</span>
          </a>
        ) : null}
      </div>
      {/* Pages scroll with the page itself (no inner scroll area, which is awkward on phones); zoomed-in pages scroll sideways. */}
      <div ref={container} className="overflow-x-auto p-2 sm:p-4" aria-label={title}>
        {failed ? (
          <p className="p-6 text-center text-sm text-slate-600" role="alert">
            Couldn&apos;t show this PDF here.{" "}
            <a href={src} target="_blank" rel="noopener" className="font-semibold text-brand-700 underline">
              Open it in a new tab
            </a>{" "}
            instead.
          </p>
        ) : !doc || width === 0 ? (
          <TuningUp message="Loading sheet music…" />
        ) : (
          <div className="mx-auto space-y-3" style={{ width: Math.round(width * zoom) }}>
            {Array.from({ length: doc.numPages }, (_, index) => (
              <PdfPage key={index} doc={doc} pageNumber={index + 1} width={Math.round(width * zoom)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One page, drawn on a canvas once it's near the visible area (and again when the width changes). */
function PdfPage({ doc, pageNumber, width }: { doc: PDFDocumentProxy; pageNumber: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // Most scores have pages of one size: A4 portrait until the real size is known.
  const [aspect, setAspect] = useState(297 / 210);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setVisible(true), {
      rootMargin: "800px 0px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || width <= 0) return;
    let cancelled = false;
    let cancelRender: (() => void) | undefined;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      setAspect(base.height / base.width);
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      const element = canvas.current;
      element.width = Math.floor(viewport.width);
      element.height = Math.floor(viewport.height);
      const task = page.render({ canvas: element, viewport });
      cancelRender = () => task.cancel();
      try {
        await task.promise;
      } catch {
        // Cancelled because the width changed or the page was closed.
      }
    })();
    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [doc, pageNumber, width, visible]);

  return (
    <div
      ref={wrapper}
      className="overflow-hidden rounded bg-white shadow-sm"
      style={{ width, height: Math.round(width * aspect) }}
    >
      <canvas ref={canvas} className="block h-full w-full" aria-label={`Page ${pageNumber}`} role="img" />
    </div>
  );
}
