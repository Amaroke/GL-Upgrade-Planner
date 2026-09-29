import { useId, useState } from "react";
import { formatDuration as formatCountdown } from "../lib/dateFormat";
import { useTick } from "../hooks/useTick";
import { CATEGORIES, type Catalog, type Category } from "../planner/catalog";
import { constructionStep, withoutStarted } from "../planner/constructions";
import {
  formatDuration,
  nextSteps,
  readDuration,
  stepLabel,
  withoutWallUpgrades,
  type NextStep,
  type StepOrder,
} from "../planner/nextSteps";
import type { ColonyBuildings, Construction } from "../store/colonyStore";
import { TypeIcon } from "./TypeIcon";

const COLLAPSED_COUNT = 5;

const ORDER_LABELS: Record<StepOrder, string> = {
  fastest: "Fastest first",
  longest: "Longest first",
};

const ALL_CATEGORIES = "all";

export const ROW_BUTTON =
  "rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/75 transition-colors hover:bg-white/10";

export const START_BUTTON =
  "rounded-md border border-green-400/50 bg-green-500/15 px-2 py-0.5 text-xs text-green-200 transition-colors hover:bg-green-500/25";

export const DONE_BUTTON =
  "rounded-md border border-accent/40 px-2 py-0.5 text-xs text-sky-100 transition-colors hover:bg-accent/15";

export function DurationEditor({
  action,
  label,
  inputLabel,
  confirmText,
  initial,
  disabled = false,
  onConfirm,
  onBack,
}: {
  disabled?: boolean;
  action: string;
  label: string;
  inputLabel: string;
  confirmText: string;
  initial: string;
  onConfirm: (seconds: number) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    const seconds = readDuration(draft);
    if (seconds === null) {
      setError("Enter a duration like 1h 30m");
      return;
    }
    onConfirm(seconds);
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        aria-label={inputLabel}
        aria-invalid={error !== null}
        value={draft}
        placeholder="1h 30m"
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") confirm();
          if (event.key === "Escape") onBack();
        }}
        className="w-24 rounded-md border border-white/15 bg-deep px-2 py-0.5 text-xs text-white"
      />
      <button
        type="button"
        aria-label={`Confirm ${action} ${label}`}
        disabled={disabled}
        onClick={confirm}
        className={`${ROW_BUTTON} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {confirmText}
      </button>
      <button
        type="button"
        aria-label={`Back ${action} ${label}`}
        onClick={onBack}
        className={ROW_BUTTON}
      >
        Back
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}

function StepRow({
  step,
  canStart,
  onStart,
  onDone,
}: {
  step: NextStep;
  canStart: boolean;
  onStart: (step: NextStep, seconds: number) => void;
  onDone: (step: NextStep) => void;
}) {
  const [isAskingDuration, setIsAskingDuration] = useState(false);
  const label = stepLabel(step);
  const { seconds } = step;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg bg-surface/5 px-3 py-1.5 transition-colors hover:bg-surface/9">
      <span className="flex items-center gap-2 text-sm text-ink">
        <TypeIcon typeId={step.typeId} size={20} />
        {label}
      </span>
      <span className="ml-auto text-xs text-white/60">{step.time ?? "time unknown"}</span>
      {isAskingDuration ? (
        <DurationEditor
          action="Start"
          label={label}
          inputLabel={`Duration of ${label}`}
          confirmText="Start"
          initial=""
          disabled={!canStart}
          onConfirm={(typed) => onStart(step, typed)}
          onBack={() => setIsAskingDuration(false)}
        />
      ) : (
        <>
          <button
            type="button"
            aria-label={`Start ${label}`}
            disabled={!canStart}
            title={canStart ? undefined : "No free Worker"}
            onClick={() => (seconds === null ? setIsAskingDuration(true) : onStart(step, seconds))}
            className={`${START_BUTTON} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Start
          </button>
          <button
            type="button"
            aria-label={`Done ${label}`}
            onClick={() => onDone(step)}
            className={DONE_BUTTON}
          >
            Done
          </button>
        </>
      )}
    </li>
  );
}

export function RunningJob({
  label,
  noun,
  finishAt,
  now,
  onDone,
  onCancel,
  onEdit,
}: {
  label: string;
  noun: string;
  finishAt: number;
  now: () => number;
  onDone: () => void;
  onCancel: () => void;
  onEdit: (seconds: number) => void;
}) {
  useTick();
  const [mode, setMode] = useState<"idle" | "confirmingCancel" | "editing">("idle");
  const remaining = Math.max(0, finishAt - now());
  return (
    <>
      <span
        className={`ml-auto text-xs tabular-nums ${remaining === 0 ? "font-semibold text-green-300" : "text-accent"}`}
      >
        {remaining === 0 ? "Finished" : formatCountdown(remaining)}
      </span>
      {mode === "editing" && (
        <DurationEditor
          action="Edit"
          label={label}
          inputLabel={`Remaining time of ${label}`}
          confirmText="Save"
          initial={formatDuration(Math.ceil(remaining / 1000))}
          onConfirm={onEdit}
          onBack={() => setMode("idle")}
        />
      )}
      {mode === "confirmingCancel" && (
        <>
          <span className="text-xs whitespace-nowrap text-white/70">Cancel this {noun}?</span>
          <button
            type="button"
            aria-label={`Confirm cancel ${label}`}
            onClick={onCancel}
            className={ROW_BUTTON}
          >
            Yes, cancel
          </button>
          <button
            type="button"
            aria-label={`Keep ${label}`}
            onClick={() => setMode("idle")}
            className={ROW_BUTTON}
          >
            Keep
          </button>
        </>
      )}
      {mode === "idle" && (
        <>
          <button
            type="button"
            aria-label={`Edit ${label}`}
            onClick={() => setMode("editing")}
            className={ROW_BUTTON}
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Done ${label}`}
            onClick={onDone}
            className={DONE_BUTTON}
          >
            Done
          </button>
          <button
            type="button"
            aria-label={`Cancel ${label}`}
            onClick={() => setMode("confirmingCancel")}
            className={ROW_BUTTON}
          >
            Cancel
          </button>
        </>
      )}
    </>
  );
}

function ConstructionRow({
  step,
  finishAt,
  now,
  onDone,
  onCancel,
  onEdit,
}: {
  step: NextStep;
  finishAt: number;
  now: () => number;
  onDone: () => void;
  onCancel: () => void;
  onEdit: (seconds: number) => void;
}) {
  const label = stepLabel(step);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg bg-accent/8 px-3 py-1.5 shadow-[inset_2px_0_0_var(--color-accent)]">
      <span className="flex items-center gap-2 text-sm text-ink">
        <TypeIcon typeId={step.typeId} size={20} />
        {label}
      </span>
      <RunningJob
        label={label}
        noun="Construction"
        finishAt={finishAt}
        now={now}
        onDone={onDone}
        onCancel={onCancel}
        onEdit={onEdit}
      />
    </li>
  );
}

type NextStepsProps = {
  catalog: Catalog;
  colonyId: string;
  starBaseLevel: number;
  buildings: ColonyBuildings;
  constructions: Construction[];
  canStart: boolean;
  now: () => number;
  hideWallUpgrades: boolean;
  onHideWallUpgradesChange: (value: boolean) => void;
  onStart: (step: NextStep, seconds: number) => void;
  onDone: (step: NextStep) => void;
  onDoneConstruction: (index: number) => void;
  onCancelConstruction: (index: number) => void;
  onEditConstruction: (index: number, seconds: number) => void;
};

type Row =
  | { construction: Construction; index: number; step: NextStep }
  | { construction: null; step: NextStep };

export function NextSteps({
  catalog,
  colonyId,
  starBaseLevel,
  buildings,
  constructions,
  canStart,
  now,
  hideWallUpgrades,
  onHideWallUpgradesChange,
  onStart,
  onDone,
  onDoneConstruction,
  onCancelConstruction,
  onEditConstruction,
}: NextStepsProps) {
  const [order, setOrder] = useState<StepOrder>("fastest");
  const [category, setCategory] = useState<Category | null>(null);
  const [expanded, setExpanded] = useState(false);
  const selectId = useId();
  const categoryId = useId();
  const allSteps = nextSteps(catalog, colonyId, starBaseLevel, buildings, order, category);
  const visibleSteps = hideWallUpgrades ? withoutWallUpgrades(allSteps) : allSteps;
  const rows: Row[] = [
    ...constructions.map((construction, index) => ({
      construction,
      index,
      step: constructionStep(catalog, construction),
    })),
    ...withoutStarted(visibleSteps, constructions).map((step) => ({ construction: null, step })),
  ];
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_COUNT);

  return (
    <section aria-label="Next steps" className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-heading">Next steps</h3>
        <span className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-white/60">
            <input
              type="checkbox"
              checked={hideWallUpgrades}
              onChange={(event) => onHideWallUpgradesChange(event.target.checked)}
            />
            Hide wall upgrades
          </label>
          <label htmlFor={categoryId} className="text-sm text-white/60">
            Category
          </label>
          <select
            id={categoryId}
            value={category ?? ALL_CATEGORIES}
            onChange={(event) =>
              setCategory(
                event.target.value === ALL_CATEGORIES ? null : (event.target.value as Category),
              )
            }
            className="select"
          >
            <option value={ALL_CATEGORIES}>All categories</option>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <label htmlFor={selectId} className="text-sm text-white/60">
            Order
          </label>
          <select
            id={selectId}
            value={order}
            onChange={(event) => setOrder(event.target.value as StepOrder)}
            className="select"
          >
            {(Object.keys(ORDER_LABELS) as StepOrder[]).map((value) => (
              <option key={value} value={value}>
                {ORDER_LABELS[value]}
              </option>
            ))}
          </select>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-white/60">Nothing to build or upgrade</p>
      ) : (
        <ul aria-label="Next steps" className="flex flex-col gap-1.5">
          {shown.map((row) =>
            row.construction ? (
              <ConstructionRow
                key={`construction-${row.index}-${row.construction.finishAt}`}
                step={row.step}
                finishAt={row.construction.finishAt}
                now={now}
                onDone={() => onDoneConstruction(row.index)}
                onCancel={() => onCancelConstruction(row.index)}
                onEdit={(seconds) => onEditConstruction(row.index, seconds)}
              />
            ) : (
              <StepRow
                key={`${row.step.typeId}-${row.step.kind}-${row.step.instance}`}
                step={row.step}
                canStart={canStart}
                onStart={onStart}
                onDone={onDone}
              />
            ),
          )}
        </ul>
      )}

      {rows.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-surface/4 py-1.5 text-sm text-sky-200 transition-colors hover:bg-surface/9 hover:text-white"
        >
          {expanded ? "Show fewer steps" : `Show all ${rows.length} steps`}
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M6 8l4 4 4-4" />
          </svg>
        </button>
      )}
    </section>
  );
}
