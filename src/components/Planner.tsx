import { useCallback, useState, useSyncExternalStore } from "react";
import { BuildingsList } from "./BuildingsList";
import { LaboratoryStrip, LaboratoryTable, type LabActions } from "./Laboratory";
import { NextSteps } from "./NextSteps";
import {
  groupedBuildingsForColony,
  sharedLevel,
  withCount,
  withLevel,
  withSharedCount,
  withSharedLevel,
} from "../planner/buildings";
import { constructionStep, startConstruction, withRemaining } from "../planner/constructions";
import {
  appliedUnits,
  idleLaboratory,
  labColonyOf,
  startJob,
  withUnitLevel,
  type LabKind,
} from "../planner/laboratory";
import { STAR_BASE_ID, type NextStep } from "../planner/nextSteps";
import { colonyProgress } from "../planner/progress";
import { DEFAULT_WORKERS, idleWorkers, runningConstructions } from "../planner/workers";
import { useTick } from "../hooks/useTick";
import { filterToUpgrade } from "../planner/statuses";
import type { Catalog } from "../planner/catalog";
import {
  COLONIES,
  isColonyUnlocked,
  MAIN_COLONY_ID,
  observatoryLevel,
  type ColonyDefinition,
} from "../planner/colonies";
import type {
  ColonyBuildings,
  ColonyEntry,
  ColonyStore,
  Construction,
  LabJob,
  UnitLevels,
} from "../store/colonyStore";
import {
  PLANNER_SETTINGS_KEY,
  type PlannerSettings,
  type SettingsStore,
} from "../store/settingsStore";

const DEFAULT_STAR_BASE_LEVEL = 1;
const NO_BUILDINGS: ColonyBuildings = {};
const NO_CONSTRUCTIONS: Construction[] = [];
const WORKER_OPTIONS = [1, 2, 3, 4, 5];

type ColonyView = "buildings" | "laboratory";

const COLONY_VIEWS: { id: ColonyView; name: string }[] = [
  { id: "buildings", name: "Buildings" },
  { id: "laboratory", name: "Laboratory" },
];

type PlannerOptions = Omit<PlannerSettings, "updatedAt">;

const DEFAULT_OPTIONS: PlannerOptions = { onlyToUpgrade: false, hideWallUpgrades: false };

function usePlannerOptions(
  store: SettingsStore,
  now: () => number,
): [PlannerOptions, (changes: Partial<PlannerOptions>) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(PLANNER_SETTINGS_KEY, onChange),
    [store],
  );
  const stored = useSyncExternalStore(subscribe, () => store.get(PLANNER_SETTINGS_KEY));
  const options: PlannerOptions = stored
    ? { onlyToUpgrade: stored.onlyToUpgrade, hideWallUpgrades: stored.hideWallUpgrades }
    : DEFAULT_OPTIONS;

  function update(changes: Partial<PlannerOptions>) {
    store.set(PLANNER_SETTINGS_KEY, { ...options, ...changes, updatedAt: now() });
  }

  return [options, update];
}

type PlannerProps = {
  store: ColonyStore;
  settingsStore: SettingsStore;
  catalog: Catalog;
  now: () => number;
};

function useColonyEntry(store: ColonyStore, colonyId: string): ColonyEntry | null {
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(colonyId, onChange),
    [store, colonyId],
  );
  return useSyncExternalStore(subscribe, () => store.get(colonyId));
}

function ColonyPanel({
  colony,
  store,
  settingsStore,
  catalog,
  now,
}: PlannerProps & { colony: ColonyDefinition }) {
  useTick();
  const entry = useColonyEntry(store, colony.id);
  const starBaseLevel = entry?.starBaseLevel ?? DEFAULT_STAR_BASE_LEVEL;
  const buildings = entry?.buildings ?? NO_BUILDINGS;
  const constructions = entry?.constructions ?? NO_CONSTRUCTIONS;
  const workers = entry?.workers ?? DEFAULT_WORKERS;
  const laboratory = labColonyOf(entry);
  const [view, setView] = useState<ColonyView>("buildings");
  const freeWorkers = workers - runningConstructions(constructions, now()).length;
  const [{ onlyToUpgrade, hideWallUpgrades }, updateOptions] = usePlannerOptions(
    settingsStore,
    now,
  );
  const allGroups = groupedBuildingsForColony(catalog, colony.id);
  const groups = onlyToUpgrade ? filterToUpgrade(allGroups, starBaseLevel, buildings) : allGroups;
  const selectId = `star-base-level-${colony.id}`;
  const workersId = `workers-${colony.id}`;

  function save(changes: {
    starBaseLevel?: number;
    buildings?: ColonyBuildings;
    constructions?: Construction[];
    workers?: number;
    units?: UnitLevels;
    research?: LabJob | null;
    unlock?: LabJob | null;
  }) {
    const next = { ...laboratory, workers, ...changes };
    store.set(colony.id, {
      starBaseLevel: next.starBaseLevel,
      buildings: next.buildings,
      ...(next.constructions.length > 0 ? { constructions: next.constructions } : {}),
      ...(next.workers === DEFAULT_WORKERS ? {} : { workers: next.workers }),
      ...(Object.keys(next.units).length > 0 ? { units: next.units } : {}),
      ...(next.research ? { research: next.research } : {}),
      ...(next.unlock ? { unlock: next.unlock } : {}),
      updatedAt: now(),
    });
  }

  const labActions: LabActions = {
    onStart: (step, seconds) => save({ [step.kind]: startJob(step, seconds, now()) }),
    onDone: (kind: LabKind) => {
      const job = laboratory[kind];
      if (job) save({ units: appliedUnits(catalog, laboratory, job), [kind]: null });
    },
    onCancel: (kind: LabKind) => save({ [kind]: null }),
    onEdit: (kind: LabKind, seconds: number) => {
      const job = laboratory[kind];
      if (job) save({ [kind]: { ...job, finishAt: now() + seconds * 1000 } });
    },
  };

  function saveLevels(typeId: string, levels: number[]) {
    save({ buildings: { ...buildings, [typeId]: levels } });
  }

  function appliedLevels(step: NextStep): number[] {
    const levels = buildings[step.typeId] ?? [];
    if (step.shared) {
      return step.kind === "build"
        ? withSharedCount(levels, levels.length + step.count)
        : withSharedLevel(levels, Math.max(sharedLevel(levels), step.targetLevel));
    }
    if (step.kind === "build") return withCount(levels, levels.length + 1);
    const fromLevel = step.targetLevel - 1;
    const index =
      levels[step.instance - 1] === fromLevel ? step.instance - 1 : levels.indexOf(fromLevel);
    return index === -1 ? levels : withLevel(levels, index, step.targetLevel);
  }

  function applied(step: NextStep): { starBaseLevel: number } | { buildings: ColonyBuildings } {
    if (step.typeId === STAR_BASE_ID) {
      return { starBaseLevel: Math.max(starBaseLevel, step.targetLevel) };
    }
    return { buildings: { ...buildings, [step.typeId]: appliedLevels(step) } };
  }

  function applyStep(step: NextStep) {
    save(applied(step));
  }

  function startStep(step: NextStep, seconds: number) {
    save({ constructions: [...constructions, startConstruction(step, seconds, now())] });
  }

  function withoutConstruction(index: number): Construction[] {
    return constructions.filter((_, i) => i !== index);
  }

  function editConstruction(index: number, seconds: number) {
    save({
      constructions: constructions.map((construction, i) =>
        i === index ? withRemaining(construction, seconds, now()) : construction,
      ),
    });
  }

  function applyConstruction(index: number) {
    save({
      ...applied(constructionStep(catalog, constructions[index])),
      constructions: withoutConstruction(index),
    });
  }

  return (
    <div role="tabpanel" aria-label={colony.name}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor={selectId} className="text-sm text-white/60">
          Star Base level
        </label>
        <select
          id={selectId}
          value={starBaseLevel}
          onChange={(event) => save({ starBaseLevel: Number(event.target.value) })}
          className="select"
        >
          {catalog.starBase.map(({ level }) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label htmlFor={workersId} className="text-sm text-white/60">
            Workers
          </label>
          <select
            id={workersId}
            value={workers}
            onChange={(event) => save({ workers: Number(event.target.value) })}
            className="select"
          >
            {WORKER_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
          <span role="status" aria-label="Workers status">
            {freeWorkers < 0 && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                Over limit
              </span>
            )}
            {freeWorkers === 0 && <span className="text-xs text-white/60">No free Worker</span>}
          </span>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-white/60">
          <input
            type="checkbox"
            checked={onlyToUpgrade}
            onChange={(event) => updateOptions({ onlyToUpgrade: event.target.checked })}
          />
          Only what to upgrade
        </label>
      </div>

      <LaboratoryStrip catalog={catalog} colony={laboratory} now={now} actions={labActions} />

      <NextSteps
        catalog={catalog}
        colonyId={colony.id}
        starBaseLevel={starBaseLevel}
        buildings={buildings}
        constructions={constructions}
        canStart={freeWorkers > 0}
        now={now}
        hideWallUpgrades={hideWallUpgrades}
        onHideWallUpgradesChange={(value) => updateOptions({ hideWallUpgrades: value })}
        onStart={startStep}
        onDone={applyStep}
        onDoneConstruction={applyConstruction}
        onCancelConstruction={(index) => save({ constructions: withoutConstruction(index) })}
        onEditConstruction={editConstruction}
      />

      <div
        role="tablist"
        aria-label={`${colony.name} view`}
        className="mt-5 inline-flex rounded-lg border border-accent/20 p-0.5 text-sm"
      >
        {COLONY_VIEWS.map(({ id, name }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`rounded-md px-4 py-1 ${view === id ? "bg-accent/15 text-ink" : "text-white/60 hover:text-white/85"}`}
          >
            {name}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={view === "buildings" ? "Buildings" : "Laboratory"}>
        {view === "buildings" ? (
          <BuildingsList
            groups={groups}
            starBaseLevel={starBaseLevel}
            buildings={buildings}
            onChange={saveLevels}
          />
        ) : (
          <LaboratoryTable
            catalog={catalog}
            colony={laboratory}
            now={now}
            onStart={labActions.onStart}
            onLevel={(unitId, level) =>
              save({ units: withUnitLevel(laboratory.units, unitId, level) })
            }
          />
        )}
      </div>
    </div>
  );
}

function percent(ratio: number): number {
  return Math.floor(Number((ratio * 100).toFixed(6)));
}

type ColonyTabProps = {
  colony: ColonyDefinition;
  store: ColonyStore;
  catalog: Catalog;
  now: () => number;
  hideWallUpgrades: boolean;
  unlocked: boolean;
  selected: boolean;
  onSelect: () => void;
};

function ColonyTab({
  colony,
  store,
  catalog,
  now,
  hideWallUpgrades,
  unlocked,
  selected,
  onSelect,
}: ColonyTabProps) {
  useTick();
  const entry = useColonyEntry(store, colony.id);
  const hasFreeWorker =
    unlocked && idleWorkers(catalog, colony.id, entry, hideWallUpgrades, now()) > 0;
  const hasIdleLaboratory = unlocked && idleLaboratory(catalog, entry, now());
  const starBaseLevel = entry?.starBaseLevel ?? DEFAULT_STAR_BASE_LEVEL;
  const progress = colonyProgress(catalog, colony.id, entry?.buildings ?? NO_BUILDINGS);
  const overall = percent(progress.overall);

  return (
    <div
      role="presentation"
      className={`relative flex min-w-0 flex-col items-center gap-1 rounded-lg border px-1 pt-0.5 pb-1.5 sm:px-2 transition-colors ${
        selected
          ? "border-accent/40 bg-accent/8"
          : "border-transparent hover:border-accent/20 hover:bg-surface/6"
      } ${unlocked ? "" : "opacity-40"}`}
    >
      <button
        type="button"
        role="tab"
        aria-label={colony.name}
        aria-selected={selected}
        disabled={!unlocked}
        onClick={onSelect}
        className={`w-full py-1 text-center text-sm font-medium transition-colors after:absolute after:inset-0 after:rounded-lg disabled:cursor-not-allowed ${
          selected ? "text-ink" : "text-white/55"
        }`}
      >
        {colony.shortName}
      </button>
      {(hasFreeWorker || hasIdleLaboratory) && (
        <span
          role="img"
          aria-label={
            hasFreeWorker
              ? `${colony.name} has a free Worker`
              : `${colony.name} has an idle Laboratory`
          }
          className="pointer-events-none absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400"
        />
      )}
      <div
        role="group"
        aria-label={`${colony.name} progress`}
        className="pointer-events-none flex w-full flex-col items-center gap-0.5"
      >
        <div
          role="progressbar"
          aria-label="Overall progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={overall}
          className="h-1.5 w-full rounded-full bg-white/10"
        >
          <div
            className="h-full rounded-full bg-green-400/70"
            style={{ width: `${progress.overall * 100}%` }}
          />
        </div>
        <span className="text-[10px] leading-none text-white/60">SB {starBaseLevel}</span>
      </div>
    </div>
  );
}

function PlannerSkeleton() {
  return (
    <div role="status" aria-label="Loading your Planner" className="animate-pulse">
      <div className="mb-4 grid grid-cols-6 gap-1 sm:grid-cols-12">
        {COLONIES.map((colony) => (
          <div key={colony.id} className="h-14 rounded-lg bg-white/5" />
        ))}
      </div>
      <div className="h-8 w-64 rounded bg-white/5" />
      <div className="mt-6 flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-10 rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}

export function Planner({ isLoading = false, ...props }: PlannerProps & { isLoading?: boolean }) {
  return (
    <section className="w-full flex-1 rounded-2xl border border-accent/12 bg-linear-to-b from-[#0c1f45]/25 to-[#050f26]/25 p-3 sm:p-5 shadow-[inset_0_1px_0_rgb(160_225_255/0.06),0_20px_50px_rgb(0_0_0/0.35)]">
      <h2 className="mb-4 text-lg font-semibold text-ink">Planner</h2>
      {isLoading ? <PlannerSkeleton /> : <LoadedPlanner {...props} />}
    </section>
  );
}

function LoadedPlanner({ store, settingsStore, catalog, now }: PlannerProps) {
  const [activeId, setActiveId] = useState(MAIN_COLONY_ID);
  const [{ hideWallUpgrades }] = usePlannerOptions(settingsStore, now);
  const observatory = observatoryLevel(
    useColonyEntry(store, MAIN_COLONY_ID)?.buildings ?? NO_BUILDINGS,
  );
  const activeColony =
    COLONIES.find((colony) => colony.id === activeId && isColonyUnlocked(colony, observatory)) ??
    COLONIES[0];

  return (
    <>
      <div
        role="tablist"
        aria-label="Colonies"
        className="mb-4 grid grid-cols-6 gap-1 sm:grid-cols-12"
      >
        {COLONIES.map((colony) => (
          <ColonyTab
            key={colony.id}
            colony={colony}
            store={store}
            catalog={catalog}
            now={now}
            hideWallUpgrades={hideWallUpgrades}
            unlocked={isColonyUnlocked(colony, observatory)}
            selected={colony.id === activeColony.id}
            onSelect={() => setActiveId(colony.id)}
          />
        ))}
      </div>

      <ColonyPanel
        key={activeColony.id}
        colony={activeColony}
        store={store}
        settingsStore={settingsStore}
        catalog={catalog}
        now={now}
      />
    </>
  );
}
