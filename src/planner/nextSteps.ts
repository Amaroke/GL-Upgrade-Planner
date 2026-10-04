import { limitsAt, groupedBuildingsForColony, sharedLevel } from "./buildings";
import type { BuildingType, Catalog, Category } from "./catalog";
import { instanceStatus } from "./statuses";
import type { ColonyBuildings } from "../store/colonyStore";

export type StepOrder = "fastest" | "longest";

export const STAR_BASE_ID = "star-base";
export const STAR_BASE_NAME = "Star Base";

export type NextStep = {
  kind: "build" | "upgrade";
  typeId: string;
  typeName: string;
  category: Category | null;
  instance: number;
  count: number;
  shared: boolean;
  targetLevel: number;
  time: string | null;
  seconds: number | null;
};

const UNIT_SECONDS: Record<string, number> = {
  w: 7 * 24 * 3600,
  d: 24 * 3600,
  h: 3600,
  m: 60,
  s: 1,
};

export function parseDuration(time: string | null): number | null {
  if (time === null) return null;
  let total = 0;
  for (const [, amount, unit] of time.matchAll(/(\d+)([wdhms])/g)) {
    total += Number(amount) * UNIT_SECONDS[unit];
  }
  return total;
}

export function readDuration(text: string): number | null {
  const compact = text.replace(/\s+/g, "").toLowerCase();
  if (!/^(\d+[wdhms])+$/.test(compact)) return null;
  return parseDuration(compact);
}

export function stepLabel(step: NextStep): string {
  if (step.kind === "build" && step.shared) return `Build ${step.count} ${step.typeName}`;
  if (step.shared) return `Upgrade ${step.count} ${step.typeName} to level ${step.targetLevel}`;
  return step.kind === "build"
    ? `Build ${step.typeName}`
    : `Upgrade ${step.typeName} to level ${step.targetLevel}`;
}

export function formatDuration(seconds: number): string {
  let rest = seconds;
  const parts = Object.entries(UNIT_SECONDS).flatMap(([unit, size]) => {
    const amount = Math.floor(rest / size);
    rest -= amount * size;
    return amount > 0 ? [`${amount}${unit}`] : [];
  });
  return parts.length > 0 ? parts.join(" ") : "0s";
}

function stepFor(
  type: BuildingType,
  kind: NextStep["kind"],
  instance: number,
  targetLevel: number,
): NextStep {
  const info = type.levels.find((entry) => entry.level === targetLevel);
  const time = info?.time ?? null;
  return {
    kind,
    typeId: type.id,
    typeName: type.name,
    category: type.category,
    instance,
    count: 1,
    shared: false,
    targetLevel,
    time,
    seconds: parseDuration(time),
  };
}

function stepsForType(type: BuildingType, starBaseLevel: number, levels: number[]): NextStep[] {
  const limits = limitsAt(type, starBaseLevel);
  const upgrades = levels.flatMap((level, index) =>
    instanceStatus(limits, index, level) === "below-limit"
      ? [stepFor(type, "upgrade", index + 1, level + 1)]
      : [],
  );
  const builds = Array.from({ length: Math.max(0, limits.maxCount - levels.length) }, (_, offset) =>
    stepFor(type, "build", levels.length + offset + 1, 1),
  );
  return [...upgrades, ...builds];
}

function sharedStep(
  type: BuildingType,
  kind: NextStep["kind"],
  count: number,
  fromLevel: number,
  targetLevel: number,
): NextStep {
  const infos = type.levels.filter(
    (entry) => entry.level >= fromLevel && entry.level <= targetLevel,
  );
  const perBuilding = infos.map((entry) => parseDuration(entry.time));
  const seconds = perBuilding.includes(null)
    ? null
    : perBuilding.reduce<number>((sum, value) => sum + (value ?? 0), 0) * count;
  return {
    kind,
    typeId: type.id,
    typeName: type.name,
    category: type.category,
    instance: 1,
    count,
    shared: true,
    targetLevel,
    time: seconds === null ? null : formatDuration(seconds),
    seconds,
  };
}

function sharedStepsForType(
  type: BuildingType,
  starBaseLevel: number,
  levels: number[],
): NextStep[] {
  const limits = limitsAt(type, starBaseLevel);
  const level = sharedLevel(levels);
  const owned = levels.length;
  const missing = limits.maxCount - levels.length;
  const steps: NextStep[] = [];
  if (owned > 0 && level < limits.maxLevel) {
    steps.push(sharedStep(type, "upgrade", owned, level + 1, level + 1));
  }
  if (missing > 0) steps.push(sharedStep(type, "build", missing, 1, level));
  return steps;
}

function starBaseSteps(catalog: Catalog, starBaseLevel: number): NextStep[] {
  const next = catalog.starBase.find((entry) => entry.level === starBaseLevel + 1);
  if (!next) return [];
  return [
    {
      kind: "upgrade",
      typeId: STAR_BASE_ID,
      typeName: STAR_BASE_NAME,
      category: null,
      instance: 1,
      count: 1,
      shared: false,
      targetLevel: next.level,
      time: next.time,
      seconds: parseDuration(next.time),
    },
  ];
}

const KIND_RANK: Record<NextStep["kind"], number> = { build: 0, upgrade: 1 };

function comparator(order: StepOrder) {
  const direction = order === "fastest" ? 1 : -1;
  return (a: NextStep, b: NextStep): number => {
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind !== 0 || a.seconds === b.seconds) return byKind;
    if (a.seconds === null) return 1;
    if (b.seconds === null) return -1;
    return (a.seconds - b.seconds) * direction;
  };
}

export function nextSteps(
  catalog: Catalog,
  colonyId: string,
  starBaseLevel: number,
  buildings: ColonyBuildings,
  order: StepOrder,
  category: Category | null = null,
): NextStep[] {
  const buildingSteps = groupedBuildingsForColony(catalog, colonyId)
    .flatMap((group) => group.types)
    .filter((type) => category === null || type.category === category)
    .flatMap((type) =>
      (type.sharedLevel ? sharedStepsForType : stepsForType)(
        type,
        starBaseLevel,
        buildings[type.id] ?? [],
      ),
    );
  const starBase = category === null ? starBaseSteps(catalog, starBaseLevel) : [];
  return [...buildingSteps, ...starBase].sort(comparator(order));
}

export function withoutWallUpgrades(steps: NextStep[]): NextStep[] {
  return steps.filter((step) => !(step.shared && step.kind === "upgrade"));
}

const BANK_AND_SILO_IDS = new Set(["bank", "silo"]);

export function withBanksAndSilosFirst(steps: NextStep[]): NextStep[] {
  const isBankOrSilo = (step: NextStep) => BANK_AND_SILO_IDS.has(step.typeId);
  return [...steps.filter(isBankOrSilo), ...steps.filter((step) => !isBankOrSilo(step))];
}
