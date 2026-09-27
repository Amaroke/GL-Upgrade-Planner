import type { Catalog } from "./catalog";
import { COLONIES, isColonyUnlocked, MAIN_COLONY_ID, observatoryLevel } from "./colonies";
import { withoutStarted } from "./constructions";
import { nextSteps, withoutWallUpgrades } from "./nextSteps";
import type { ColonyEntry, ColonyStore } from "../store/colonyStore";

export const DEFAULT_WORKERS = 1;
const DEFAULT_STAR_BASE_LEVEL = 1;

export function idleWorkers(
  catalog: Catalog,
  colonyId: string,
  entry: ColonyEntry | null,
  now: number,
  hideWallUpgrades: boolean,
): number {
  const running = (entry?.constructions ?? []).filter(
    (construction) => construction.finishAt > now,
  );
  const free = (entry?.workers ?? DEFAULT_WORKERS) - running.length;
  if (free <= 0) return 0;
  const steps = nextSteps(
    catalog,
    colonyId,
    entry?.starBaseLevel ?? DEFAULT_STAR_BASE_LEVEL,
    entry?.buildings ?? {},
    "fastest",
  );
  const visible = hideWallUpgrades ? withoutWallUpgrades(steps) : steps;
  return withoutStarted(visible, running).length > 0 ? free : 0;
}

export function totalIdleWorkers(
  catalog: Catalog,
  store: ColonyStore,
  now: number,
  hideWallUpgrades: boolean,
): number {
  const observatory = observatoryLevel(store.get(MAIN_COLONY_ID)?.buildings ?? {});
  return COLONIES.filter((colony) => isColonyUnlocked(colony, observatory)).reduce(
    (total, colony) =>
      total + idleWorkers(catalog, colony.id, store.get(colony.id), now, hideWallUpgrades),
    0,
  );
}
