import { GearIcon } from "./GearIcon";
import type { DropTimerState } from "../hooks/useDropsTimers";
import { formatDuration } from "../lib/dateFormat";

export function TimerChipSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex w-full shrink-0 animate-pulse items-center gap-2.5 rounded-2xl border sm:w-auto border-white/8 py-2.5 pr-3 pl-2.5"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <div className="h-9 w-9 shrink-0 rounded-full bg-white/10" />
      <div className="flex min-w-17 flex-col gap-1.5">
        <span className="h-3 w-16 rounded bg-white/10" />
        <span className="h-3.5 w-12 rounded bg-white/10" />
      </div>
      <div className="h-8 w-8 shrink-0 rounded-full bg-white/10" />
    </div>
  );
}

type TimerChipProps = DropTimerState & {
  name: string;
  image: string;
  accent: string;
  onOpenAdvanced: () => void;
};

export function TimerChip({
  name,
  image,
  accent,
  readyAt,
  remaining,
  isReady,
  isRunning,
  collect,
  onOpenAdvanced,
}: TimerChipProps) {
  return (
    <div
      role="group"
      aria-label={`${name} timer`}
      className="relative flex w-full shrink-0 items-center gap-2.5 rounded-2xl border py-2 pr-3 pl-2.5 sm:w-auto sm:py-2.5"
      style={{
        borderColor: isReady ? accent : "rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        boxShadow: isReady ? `0 0 18px ${accent}40` : undefined,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-1.5"
        style={{ background: `${accent}22`, border: `1px solid ${accent}66` }}
      >
        <img src={image} alt="" className="h-full w-full object-contain" />
      </div>

      <div className="flex min-w-17 flex-1 flex-col sm:flex-none">
        <span className="text-xs font-semibold text-white">{name}</span>
        <span
          className="font-mono text-sm tabular-nums"
          style={{
            color: isReady ? accent : isRunning ? "var(--color-ink)" : "rgba(255,255,255,0.45)",
          }}
        >
          {isReady ? "Ready!" : remaining === null ? "--:--:--" : formatDuration(remaining)}
        </span>
      </div>

      <button
        type="button"
        onClick={collect}
        disabled={isRunning}
        aria-label={readyAt === null ? `Start ${name} timer` : `Collect ${name}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed"
        style={{
          background: isReady ? accent : "rgba(255,255,255,0.08)",
          color: isReady ? "var(--color-night)" : "var(--color-ink)",
          opacity: isRunning ? 0.35 : 1,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M3 12a9 9 0 1 1 3 6.7" />
          <path d="M3 21v-6h6" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onOpenAdvanced}
        aria-label={`Advanced settings for ${name}`}
        className="absolute -top-2 -right-2 flex h-5.5 w-5.5 items-center justify-center rounded-full border border-white/10 bg-panel text-white/50 transition-colors hover:bg-white/10 hover:text-white/90"
      >
        <GearIcon className="h-3 w-3" />
      </button>
    </div>
  );
}
