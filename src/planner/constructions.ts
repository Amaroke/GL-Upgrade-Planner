import type { Catalog } from "./catalog";
import { COLONIES } from "./colonies";
import { stepLabel, type NextStep } from "./nextSteps";
import type { Notice } from "../hooks/useReadyNotifications";
import type { ColonyStore, Construction } from "../store/colonyStore";

export function startConstruction(step: NextStep, seconds: number, now: number): Construction {
  return {
    kind: step.kind,
    typeId: step.typeId,
    instance: step.instance,
    count: step.count,
    targetLevel: step.targetLevel,
    finishAt: now + seconds * 1000,
  };
}

export function constructionStep(catalog: Catalog, construction: Construction): NextStep {
  const type = catalog.buildings.find((entry) => entry.id === construction.typeId);
  return {
    kind: construction.kind,
    typeId: construction.typeId,
    typeName: type?.name ?? construction.typeId,
    category: type?.category ?? "Resource",
    instance: construction.instance,
    count: construction.count,
    shared: type?.sharedLevel ?? false,
    targetLevel: construction.targetLevel,
    time: null,
    seconds: null,
  };
}

export function withRemaining(
  construction: Construction,
  seconds: number,
  now: number,
): Construction {
  return { ...construction, finishAt: now + seconds * 1000 };
}

function matches(step: NextStep, construction: Construction): boolean {
  if (step.kind !== construction.kind || step.typeId !== construction.typeId) return false;
  return (
    step.kind === "build" ||
    (step.instance === construction.instance && step.targetLevel === construction.targetLevel)
  );
}

export function withoutStarted(steps: NextStep[], constructions: Construction[]): NextStep[] {
  const pending = [...constructions];
  return steps.filter((step) => {
    const index = pending.findIndex((construction) => matches(step, construction));
    if (index === -1) return true;
    pending.splice(index, 1);
    return false;
  });
}

export function constructionNotices(catalog: Catalog, store: ColonyStore): Notice[] {
  return COLONIES.flatMap((colony) => {
    const seen = new Map<string, number>();
    return (store.get(colony.id)?.constructions ?? []).map((construction) => {
      const { kind, typeId, instance, targetLevel } = construction;
      const identity = `${colony.id}-${kind}-${typeId}-${instance}-${targetLevel}`;
      const occurrence = seen.get(identity) ?? 0;
      seen.set(identity, occurrence + 1);
      return {
        key: `construction-${identity}-${occurrence}`,
        readyAt: construction.finishAt,
        title: `${stepLabel(constructionStep(catalog, construction))} is finished`,
        body: `On ${colony.name}.`,
      };
    });
  });
}
