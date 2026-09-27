import { useCallback, useState, useSyncExternalStore } from "react";
import { BuildingsList } from "./BuildingsList";
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
import type { NextStep } from "../planner/nextSteps";
import { colonyProgress } from "../planner/progress";
import { DEFAULT_WORKERS, idleWorkers } from "../planner/workers";
import { filterToUpgrade } from "../planner/statuses";
import type { Catalog } from "../planner/catalog";
import {
  COLONIES,
  isColonyUnlocked,
  MAIN_COLONY_ID,
  observatoryLevel,
  type ColonyDefinition,
} from "../planner/colonies";
import type { ColonyBuildings, ColonyEntry, ColonyStore, Construction } from "../store/colonyStore";
import {
  PLANNER_SETTINGS_KEY,
  type PlannerSettings,
  type SettingsStore,
} from "../store/settingsStore";

const DEFAULT_STAR_BASE_LEVEL = 1;
const NO_BUILDINGS: ColonyBuildings = {};
const NO_CONSTRUCTIONS: Construction[] = [];
const WORKER_OPTIONS = [1, 2, 3, 4, 5];

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
  const entry = useColonyEntry(store, colony.id);
  const starBaseLevel = entry?.starBaseLevel ?? DEFAULT_STAR_BASE_LEVEL;
  const buildings = entry?.buildings ?? NO_BUILDINGS;
  const constructions = entry?.constructions ?? NO_CONSTRUCTIONS;
  const workers = entry?.workers ?? DEFAULT_WORKERS;
  const freeWorkers = workers - constructions.length;
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
  }) {
    const next = { starBaseLevel, buildings, constructions, workers, ...changes };
    store.set(colony.id, {
      starBaseLevel: next.starBaseLevel,
      buildings: next.buildings,
      ...(next.constructions.length > 0 ? { constructions: next.constructions } : {}),
      ...(next.workers === DEFAULT_WORKERS ? {} : { workers: next.workers }),
      updatedAt: now(),
    });
  }

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

  function applyStep(step: NextStep) {
    saveLevels(step.typeId, appliedLevels(step));
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
    const step = constructionStep(catalog, constructions[index]);
    save({
      buildings: { ...buildings, [step.typeId]: appliedLevels(step) },
      constructions: withoutConstruction(index),
    });
  }

  return (
    <div role="tabpanel" aria-label={colony.name}>
      <div className="flex items-center gap-3">
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

      <BuildingsList
        groups={groups}
        starBaseLevel={starBaseLevel}
        buildings={buildings}
        onChange={saveLevels}
      />
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
  hideWallUpgrades: boolean;
  unlocked: boolean;
  selected: boolean;
  onSelect: () => void;
};

function ColonyTab({
  colony,
  store,
  catalog,
  hideWallUpgrades,
  unlocked,
  selected,
  onSelect,
}: ColonyTabProps) {
  const entry = useColonyEntry(store, colony.id);
  const hasFreeWorker = unlocked && idleWorkers(catalog, colony.id, entry, hideWallUpgrades) > 0;
  const starBaseLevel = entry?.starBaseLevel ?? DEFAULT_STAR_BASE_LEVEL;
  const progress = colonyProgress(catalog, colony.id, entry?.buildings ?? NO_BUILDINGS);
  const overall = percent(progress.overall);

  return (
    <div
      role="presentation"
      className={`relative flex flex-col items-center gap-1 rounded-lg border px-2 pt-0.5 pb-1.5 transition-colors ${
        selected
          ? "border-white/20 bg-white/8"
          : "border-transparent hover:border-white/10 hover:bg-white/4"
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
          selected ? "text-[#e9e6f5]" : "text-white/40"
        }`}
      >
        {colony.shortName}
      </button>
      {hasFreeWorker && (
        <span
          role="img"
          aria-label={`${colony.name} has a free Worker`}
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
        <span className="text-[10px] leading-none text-white/50">SB {starBaseLevel}</span>
      </div>
    </div>
  );
}

export function Planner({ store, settingsStore, catalog, now }: PlannerProps) {
  const [activeId, setActiveId] = useState(MAIN_COLONY_ID);
  const [{ hideWallUpgrades }] = usePlannerOptions(settingsStore, now);
  const observatory = observatoryLevel(
    useColonyEntry(store, MAIN_COLONY_ID)?.buildings ?? NO_BUILDINGS,
  );
  const activeColony =
    COLONIES.find((colony) => colony.id === activeId && isColonyUnlocked(colony, observatory)) ??
    COLONIES[0];

  return (
    <section className="w-full flex-1 rounded-2xl border border-white/10 p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Planner</h2>

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
    </section>
  );
}
