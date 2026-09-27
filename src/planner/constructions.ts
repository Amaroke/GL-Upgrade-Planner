import type { Catalog } from "./catalog";
import type { NextStep } from "./nextSteps";
import type { Construction } from "../store/colonyStore";

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
