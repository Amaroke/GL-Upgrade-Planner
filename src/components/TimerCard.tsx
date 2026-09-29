import { useState } from "react";
import { GearIcon } from "./GearIcon";
import type { DropTimerState } from "../hooks/useDropsTimers";
import { formatDuration, formatReadyDate, toDatetimeLocalValue } from "../lib/dateFormat";

type TimerCardProps = DropTimerState & {
  name: string;
  image: string;
  cooldownHours: number;
  accent: string;
  now: () => number;
};

export function TimerCard({
  name,
  image,
  cooldownHours,
  accent,
  now,
  readyAt,
  remaining,
  isReady,
  isRunning,
  collect,
  reset,
  setManualReadyAt,
}: TimerCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);

  const [lastReadyAt, setLastReadyAt] = useState(readyAt);
  if (readyAt !== lastReadyAt) {
    setLastReadyAt(readyAt);
    setIsConfirmingReset(false);
  }

  const askResetConfirmation = () => setIsConfirmingReset(true);
  const cancelReset = () => setIsConfirmingReset(false);
  const confirmReset = () => {
    reset();
    setIsConfirmingReset(false);
  };

  const openEditor = () => {
    setIsConfirmingReset(false);
    setDraftDate(toDatetimeLocalValue(readyAt ?? now() + cooldownHours * 3600 * 1000));
    setEditorError(null);
    setIsEditing(true);
  };

  const closeEditor = () => {
    setEditorError(null);
    setIsEditing(false);
  };

  const confirmEditor = () => {
    const timestamp = new Date(draftDate).getTime();
    if (!Number.isFinite(timestamp)) {
      setEditorError("Invalid date. Enter a valid date and time.");
      return;
    }
    setManualReadyAt(timestamp);
    closeEditor();
  };

  return (
    <div
      role="group"
      aria-label={name}
      className="relative flex flex-col items-center gap-4 rounded-2xl border p-6 text-center backdrop-blur-sm transition-shadow"
      style={{
        borderColor: isReady ? accent : "rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        boxShadow: isReady ? `0 0 24px ${accent}55` : undefined,
      }}
    >
      <button
        type="button"
        onClick={openEditor}
        aria-label={`Set ${name} Ready date manually`}
        className="absolute top-3 left-3 flex h-6 w-6 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
      >
        <GearIcon className="h-3.5 w-3.5" />
      </button>

      {readyAt !== null && !isEditing && !isConfirmingReset && (
        <button
          type="button"
          onClick={askResetConfirmation}
          aria-label={`Reset ${name} timer`}
          className="absolute top-3 right-3 rounded-full px-2.5 py-1 text-xs font-medium text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          Reset
        </button>
      )}

      <div
        className="flex h-20 w-20 items-center justify-center rounded-full p-3"
        style={{ background: `${accent}22`, border: `1px solid ${accent}66` }}
      >
        <img src={image} alt={name} className="h-full w-full object-contain drop-shadow-md" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white">{name}</h2>
        <p className="text-sm text-white/40">Cooldown: {cooldownHours}h</p>
      </div>

      {isEditing ? (
        <div className="flex w-full flex-col items-center gap-2">
          <input
            type="datetime-local"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            aria-invalid={editorError !== null}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white scheme-dark"
          />
          {editorError && (
            <p role="alert" className="text-sm text-red-400">
              {editorError}
            </p>
          )}
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={closeEditor}
              className="flex-1 rounded-xl bg-white/8 px-4 py-2 font-medium text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmEditor}
              className="flex-1 rounded-xl px-4 py-2 font-medium transition-colors"
              style={{ background: accent, color: "var(--color-night)" }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <div
              className="font-mono text-3xl tabular-nums"
              style={{ color: isReady ? accent : "var(--color-ink)" }}
            >
              {isReady ? "Ready!" : remaining === null ? "--:--:--" : formatDuration(remaining)}
            </div>
            {isConfirmingReset ? (
              <p role="alert" className="mt-1 h-5 text-sm text-white/70">
                Reset this timer?
              </p>
            ) : (
              <p className="mt-1 h-5 text-sm text-white/50">
                {isRunning && readyAt !== null ? formatReadyDate(readyAt) : null}
              </p>
            )}
          </div>

          {isConfirmingReset ? (
            <div className="flex w-full gap-2">
              <button
                type="button"
                autoFocus
                onClick={cancelReset}
                className="flex-1 rounded-xl bg-white/8 px-4 py-2 font-medium text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReset}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2 font-medium text-white transition-colors"
              >
                Reset
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={collect}
              disabled={isRunning}
              className="w-full rounded-xl px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed"
              style={{
                background: isReady ? accent : "rgba(255,255,255,0.08)",
                color: isReady ? "var(--color-night)" : "var(--color-ink)",
                opacity: isRunning ? 0.4 : 1,
              }}
            >
              {readyAt === null ? "Start timer" : "Collected"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
