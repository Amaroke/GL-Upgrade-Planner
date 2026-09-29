import { useState } from "react";

type NumberFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  compact?: boolean;
};

const BUTTON_CLASS =
  "flex items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";
const REGULAR_BUTTON = "size-7 border border-white/15 text-sm";
const COMPACT_BUTTON = "size-5 text-xs";
const REGULAR_INPUT = "w-14 rounded-md border border-white/15 bg-deep px-2 py-1 text-sm";
const COMPACT_INPUT = "w-7 bg-transparent text-xs font-medium";

export function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
  compact = false,
}: NumberFieldProps) {
  const buttonClass = `${BUTTON_CLASS} ${compact ? COMPACT_BUTTON : REGULAR_BUTTON}`;
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const typed = Number(draft);
    setDraft(null);
    const accepted = draft.trim() !== "" && Number.isInteger(typed) && typed >= min && typed <= max;
    if (accepted && typed !== value) onCommit(typed);
  }

  return (
    <span className={`inline-flex items-center ${compact ? "gap-0.5" : "gap-1.5"}`}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onCommit(value - 1)}
        className={buttonClass}
      >
        -
      </button>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className={`${compact ? COMPACT_INPUT : REGULAR_INPUT} [appearance:textfield] text-center text-white [&::-webkit-inner-spin-button]:appearance-none`}
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onCommit(value + 1)}
        className={buttonClass}
      >
        +
      </button>
      {!compact && <span className="text-sm text-white/50">/ {max}</span>}
    </span>
  );
}
