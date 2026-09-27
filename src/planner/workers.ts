import type { Catalog } from "./catalog";
import { COLONIES, isColonyUnlocked, MAIN_COLONY_ID, observatoryLevel } from "./colonies";
import { withoutStarted } from "./constructions";
import { nextSteps, withoutWallUpgrades } from "./nextSteps";
import type { ColonyEntry, ColonyStore, Construction } from "../store/colonyStore";

export const DEFAULT_WORKERS = 1;
const DEFAULT_STAR_BASE_LEVEL = 1;

export function runningConstructions(constructions: Construction[], now: number): Construction[] {
  return constructions.filter((construction) => construction.finishAt > now);
}

export function idleWorkers(
  catalog: Catalog,
  colonyId: string,
  entry: ColonyEntry | null,
  hideWallUpgrades: boolean,
  now: number,
): number {
  const constructions = entry?.constructions ?? [];
  const free =
    (entry?.workers ?? DEFAULT_WORKERS) - runningConstructions(constructions, now).length;
  if (free <= 0) return 0;
  const steps = nextSteps(
    catalog,
    colonyId,
    entry?.starBaseLevel ?? DEFAULT_STAR_BASE_LEVEL,
    entry?.buildings ?? {},
    "fastest",
  );
  const visible = hideWallUpgrades ? withoutWallUpgrades(steps) : steps;
  return withoutStarted(visible, constructions).length > 0 ? free : 0;
}

export function totalIdleWorkers(
  catalog: Catalog,
  store: ColonyStore,
  hideWallUpgrades: boolean,
  now: number,
): number {
  const observatory = observatoryLevel(store.get(MAIN_COLONY_ID)?.buildings ?? {});
  return COLONIES.filter((colony) => isColonyUnlocked(colony, observatory)).reduce(
    (total, colony) => {
      const entry = store.get(colony.id);
      const constructions = entry?.constructions ?? [];
      const finished = constructions.length - runningConstructions(constructions, now).length;
      return (
        total +
        Math.max(0, idleWorkers(catalog, colony.id, entry, hideWallUpgrades, now) - finished)
      );
    },
    0,
  );
}
