import { useId, useState } from "react";
import { CATEGORIES, type Catalog, type Category } from "../planner/catalog";
import {
  nextSteps,
  withoutWallUpgrades,
  type NextStep,
  type StepOrder,
} from "../planner/nextSteps";
import type { ColonyBuildings } from "../store/colonyStore";

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

function StepRow({ step, onDone }: { step: NextStep; onDone: (step: NextStep) => void }) {
  const label = stepLabel(step);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2">
      <span className="text-sm text-[#e9e6f5]">{label}</span>
      <span className="ml-auto text-xs text-white/60">{step.time ?? "time unknown"}</span>
      <button
        type="button"
        aria-label={`Done ${label}`}
        onClick={() => onDone(step)}
        className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10"
      >
        Done
      </button>
    </li>
  );
}

type NextStepsProps = {
  catalog: Catalog;
  colonyId: string;
  starBaseLevel: number;
  buildings: ColonyBuildings;
  hideWallUpgrades: boolean;
  onHideWallUpgradesChange: (value: boolean) => void;
  onDone: (step: NextStep) => void;
};

export function NextSteps({
  catalog,
  colonyId,
  starBaseLevel,
  buildings,
  hideWallUpgrades,
  onHideWallUpgradesChange,
  onDone,
}: NextStepsProps) {
  const [order, setOrder] = useState<StepOrder>("fastest");
  const [category, setCategory] = useState<Category | null>(null);
  const [expanded, setExpanded] = useState(false);
  const selectId = useId();
  const categoryId = useId();
  const allSteps = nextSteps(catalog, colonyId, starBaseLevel, buildings, order, category);
  const steps = hideWallUpgrades ? withoutWallUpgrades(allSteps) : allSteps;
  const shown = expanded ? steps : steps.slice(0, COLLAPSED_COUNT);

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

      {steps.length === 0 ? (
        <p className="text-sm text-white/60">Nothing to build or upgrade</p>
      ) : (
        <ul aria-label="Next steps" className="flex flex-col gap-2">
          {shown.map((step) => (
            <StepRow
              key={`${step.typeId}-${step.kind}-${step.instance}`}
              step={step}
              onDone={onDone}
            />
          ))}
        </ul>
      )}

      {steps.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-sm text-white/60 underline"
        >
          {expanded ? "Show fewer steps" : `Show all ${steps.length} steps`}
        </button>
      )}
    </section>
  );
}
