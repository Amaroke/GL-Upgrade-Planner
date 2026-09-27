import { useEffect, useId, useState } from "react";
import { formatDuration } from "../lib/dateFormat";
import { CATEGORIES, type Catalog, type Category } from "../planner/catalog";
import { constructionStep, withoutStarted } from "../planner/constructions";
import {
  nextSteps,
  withoutWallUpgrades,
  type NextStep,
  type StepOrder,
} from "../planner/nextSteps";
import type { ColonyBuildings, Construction } from "../store/colonyStore";

const COLLAPSED_COUNT = 5;

const ORDER_LABELS: Record<StepOrder, string> = {
  fastest: "Fastest first",
  longest: "Longest first",
};

const ALL_CATEGORIES = "all";

function stepLabel(step: NextStep): string {
  if (step.kind === "build" && step.shared) return `Build ${step.count} ${step.typeName}`;
  if (step.shared) return `Upgrade ${step.count} ${step.typeName} to level ${step.targetLevel}`;
  return step.kind === "build"
    ? `Build ${step.typeName}`
    : `Upgrade ${step.typeName} to level ${step.targetLevel}`;
}

const ROW_BUTTON =
  "rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10";

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
  const label = stepLabel(step);
  const { seconds } = step;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2">
      <span className="text-sm text-[#e9e6f5]">{label}</span>
      <span className="ml-auto text-xs text-white/60">{step.time ?? "time unknown"}</span>
      {seconds !== null && (
        <button
          type="button"
          aria-label={`Start ${label}`}
          disabled={!canStart}
          onClick={() => onStart(step, seconds)}
          className={`${ROW_BUTTON} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Start
        </button>
      )}
      <button
        type="button"
        aria-label={`Done ${label}`}
        onClick={() => onDone(step)}
        className={ROW_BUTTON}
      >
        Done
      </button>
    </li>
  );
}

function useTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

function ConstructionRow({
  step,
  finishAt,
  now,
  onDone,
  onCancel,
}: {
  step: NextStep;
  finishAt: number;
  now: () => number;
  onDone: () => void;
  onCancel: () => void;
}) {
  useTick();
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const label = stepLabel(step);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-400/40 bg-sky-400/5 px-3 py-2">
      <span className="text-sm text-[#e9e6f5]">{label}</span>
      <span className="ml-auto text-xs tabular-nums text-sky-200">
        {formatDuration(Math.max(0, finishAt - now()))}
      </span>
      {isConfirmingCancel ? (
        <>
          <span className="text-xs text-white/70">Cancel this Construction?</span>
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
            onClick={() => setIsConfirmingCancel(false)}
            className={ROW_BUTTON}
          >
            Keep
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            aria-label={`Done ${label}`}
            onClick={onDone}
            className={ROW_BUTTON}
          >
            Done
          </button>
          <button
            type="button"
            aria-label={`Cancel ${label}`}
            onClick={() => setIsConfirmingCancel(true)}
            className={ROW_BUTTON}
          >
            Cancel
          </button>
        </>
      )}
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
    <section aria-label="Next steps" className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">Next steps</h3>
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
        <ul aria-label="Next steps" className="flex flex-col gap-2">
          {shown.map((row) =>
            row.construction ? (
              <ConstructionRow
                key={`construction-${row.index}-${row.construction.finishAt}`}
                step={row.step}
                finishAt={row.construction.finishAt}
                now={now}
                onDone={() => onDoneConstruction(row.index)}
                onCancel={() => onCancelConstruction(row.index)}
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
          className="mt-2 text-sm text-white/60 underline"
        >
          {expanded ? "Show fewer steps" : `Show all ${rows.length} steps`}
        </button>
      )}
    </section>
  );
}
