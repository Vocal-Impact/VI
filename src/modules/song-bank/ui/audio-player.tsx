"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, Pause, Play, Repeat } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Equalizer } from "@/shared/ui/music";

const SPEEDS = [0.5, 0.75, 0.9, 1, 1.25] as const;
/** Starting one player pauses the others (event detail: the player's id). */
const PLAY_EVENT = "song-bank:play";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * A recording player for learning parts: play/pause, seek, slower or faster
 * playback, repeat, and an A–B loop to drill one passage. Nothing is
 * downloaded until Play (`preload="none"`), so a folder of recordings opens fast.
 * To switch recordings, give it a new `key` so it starts over.
 */
export function AudioPlayer({
  src,
  downloadHref,
  title,
  className,
  autoPlay = false,
}: {
  /** Same-origin link that redirects to the stored recording. */
  src: string;
  downloadHref?: string;
  title: string;
  className?: string;
  autoPlay?: boolean;
}) {
  const id = useId();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [repeat, setRepeat] = useState(false);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);

  useEffect(() => {
    const pauseOthers = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) audio.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, pauseOthers);
    return () => window.removeEventListener(PLAY_EVENT, pauseOthers);
  }, [id]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  async function toggle() {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    setFailed(false);
    try {
      await element.play();
    } catch (error) {
      // Stopped by another play/pause, not a real failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFailed(true);
    }
  }

  function seek(seconds: number) {
    if (audio.current) audio.current.currentTime = Math.max(0, Math.min(seconds, duration || seconds));
  }

  /** First press marks A, second marks B (then it loops A→B), third clears. */
  function markLoop() {
    const now = audio.current?.currentTime ?? 0;
    if (loopA === null) setLoopA(now);
    else if (loopB === null) {
      if (now <= loopA + 0.5) {
        // B before (or right on) A: start the loop again from here.
        setLoopA(now);
        return;
      }
      setLoopB(now);
      seek(loopA);
    } else {
      setLoopA(null);
      setLoopB(null);
    }
  }

  const loopLabel = loopA === null ? "A–B" : loopB === null ? "Set B" : `${formatClock(loopA)}–${formatClock(loopB)}`;

  return (
    <div className={cn("rounded-lg border border-slate-200 bg-slate-50 px-3 py-2", className)}>
      <audio
        ref={audio}
        src={src}
        preload="none"
        autoPlay={autoPlay}
        loop={repeat && loopB === null}
        onPlay={() => {
          setPlaying(true);
          window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id }));
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onCanPlay={() => setLoading(false)}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          event.currentTarget.playbackRate = speed;
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          if (loopA !== null && loopB !== null && element.currentTime >= loopB) element.currentTime = loopA;
          setTime(element.currentTime);
        }}
        onError={() => {
          setFailed(true);
          setLoading(false);
          setPlaying(false);
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-sticker-brand transition-transform hover:bg-ink-soft active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          {loading && playing ? (
            <Equalizer className="h-4" bars={3} label="Loading" />
          ) : playing ? (
            <Pause className="size-4" aria-hidden="true" />
          ) : (
            <Play className="ml-0.5 size-4" aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="relative h-5">
            {loopA !== null && duration > 0 ? (
              <span
                aria-hidden="true"
                className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-brand-200"
                style={{
                  left: `${(loopA / duration) * 100}%`,
                  width: `${(((loopB ?? time) - loopA) / duration) * 100}%`,
                }}
              />
            ) : null}
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(time, duration || 0)}
              onChange={(event) => seek(Number(event.target.value))}
              disabled={!duration}
              aria-label={`Position in ${title}`}
              aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
              className="relative h-5 w-full cursor-pointer accent-brand-600 disabled:cursor-default"
              style={{ background: "transparent" }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="tabular-nums">
              {formatClock(time)} / {duration ? formatClock(duration) : "–:––"}
            </span>
            <label className="inline-flex items-center gap-1">
              <span className="sr-only">Speed</span>
              <select
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                className="rounded border border-slate-300 bg-white px-1 py-0.5 text-base text-slate-700 sm:text-xs"
                aria-label={`Playback speed for ${title}`}
              >
                {SPEEDS.map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setRepeat((value) => !value)}
              aria-pressed={repeat}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold",
                repeat ? "bg-brand-100 text-brand-800" : "hover:bg-slate-200",
              )}
              title="Repeat"
            >
              <Repeat className="size-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Repeat</span>
            </button>
            <button
              type="button"
              onClick={markLoop}
              disabled={!duration}
              aria-pressed={loopB !== null}
              className={cn(
                "rounded px-1.5 py-0.5 font-semibold tabular-nums disabled:opacity-50",
                loopA !== null ? "bg-brand-100 text-brand-800" : "hover:bg-slate-200",
              )}
              title="Loop a passage: press at the start (A), then at the end (B). Press again to stop."
            >
              {loopLabel}
            </button>
            {downloadHref ? (
              <a
                href={downloadHref}
                className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold hover:bg-slate-200"
              >
                <Download className="size-3.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Download</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>
      {failed ? (
        <p className="mt-1.5 text-xs text-red-700" role="alert">
          This recording won&apos;t play here
          {downloadHref ? (
            <>
              {" "}
              — try{" "}
              <a href={downloadHref} className="font-semibold underline">
                downloading it
              </a>
            </>
          ) : null}
          . Some phones can&apos;t play WhatsApp voice notes (.opus/.ogg) in the browser.
        </p>
      ) : null}
    </div>
  );
}
