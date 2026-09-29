import type { Catalog, UnitType } from "./catalog";
import { COLONIES } from "./colonies";
import { parseDuration } from "./nextSteps";
import type { Notice } from "../hooks/useReadyNotifications";
import type {
  ColonyBuildings,
  ColonyStore,
  Construction,
  LabJob,
  UnitLevels,
} from "../store/colonyStore";

export const LABORATORY_ID = "laboratory";
export const MEDAL_LEVEL = 7;

export type LabKind = "research" | "unlock";

export type LabColony = {
  starBaseLevel: number;
  buildings: ColonyBuildings;
  constructions: Construction[];
  units: UnitLevels;
  research: LabJob | null;
  unlock: LabJob | null;
};

export type UnitStatus = "locked" | "to-unlock" | "below-limit" | "maxed" | "over-limit";

export type UnitView = {
  unit: UnitType;
  level: number | null;
  cap: number;
  status: UnitStatus;
  lockReason: string | null;
};

export type UnitStep = {
  kind: LabKind;
  unit: UnitType;
  targetLevel: number;
  time: string | null;
  seconds: number | null;
};

export function laboratoryLevel(buildings: ColonyBuildings): number {
  return buildings[LABORATORY_ID]?.[0] ?? 0;
}

export function researchBlocker(colony: LabColony, now: number): string | null {
  if (laboratoryLevel(colony.buildings) === 0) return "No Laboratory";
  const upgrading = colony.constructions.some(
    (construction) => construction.typeId === LABORATORY_ID && construction.finishAt > now,
  );
  return upgrading ? "Laboratory is being upgraded" : null;
}

export function unitCap(unit: UnitType, laboratory: number): number {
  return 1 + unit.levels.filter((info) => info.laboratory <= laboratory).length;
}

function lockReason(catalog: Catalog, unit: UnitType, colony: LabColony): string | null {
  if (colony.starBaseLevel < unit.starBase) return `Unlocks at Star Base ${unit.starBase}`;
  if ((colony.buildings[unit.building]?.length ?? 0) > 0) return null;
  const name = catalog.buildings.find((type) => type.id === unit.building)?.name ?? unit.building;
  return `Needs a ${name}`;
}

export function unitLevel(catalog: Catalog, unit: UnitType, colony: LabColony): number | null {
  const stored = colony.units[unit.id];
  if (stored !== undefined) return stored;
  return unit.startsUnlocked && lockReason(catalog, unit, colony) === null ? 1 : null;
}

function statusOf(level: number | null, cap: number, locked: boolean): UnitStatus {
  if (locked) return "locked";
  if (level === null) return "to-unlock";
  if (level > cap) return "over-limit";
  return level < cap ? "below-limit" : "maxed";
}

export function unitViews(catalog: Catalog, colony: LabColony): UnitView[] {
  const laboratory = laboratoryLevel(colony.buildings);
  return catalog.units.map((unit) => {
    const reason = lockReason(catalog, unit, colony);
    const level = unitLevel(catalog, unit, colony);
    const cap = unitCap(unit, laboratory);
    return { unit, level, cap, status: statusOf(level, cap, reason !== null), lockReason: reason };
  });
}

function stepOf(view: UnitView): UnitStep | null {
  const { unit, level, status } = view;
  if (status === "to-unlock") {
    return {
      kind: "unlock",
      unit,
      targetLevel: 1,
      time: unit.unlockTime,
      seconds: parseDuration(unit.unlockTime),
    };
  }
  if (status !== "below-limit" || level === null) return null;
  const time = unit.levels.find((info) => info.level === level + 1)?.time ?? null;
  return { kind: "research", unit, targetLevel: level + 1, time, seconds: parseDuration(time) };
}

function fastestFirst(a: UnitStep, b: UnitStep): number {
  if (a.seconds === b.seconds) return 0;
  if (a.seconds === null) return 1;
  if (b.seconds === null) return -1;
  return a.seconds - b.seconds;
}

export function unitSteps(catalog: Catalog, colony: LabColony): UnitStep[] {
  return unitViews(catalog, colony)
    .flatMap((view) => stepOf(view) ?? [])
    .filter((step) => colony[step.kind]?.unitId !== step.unit.id)
    .sort(fastestFirst);
}

export function jobLabel(catalog: Catalog, kind: LabKind, job: LabJob): string {
  const name = catalog.units.find((unit) => unit.id === job.unitId)?.name ?? job.unitId;
  return kind === "unlock" ? `Unlock ${name}` : `Research ${name} to level ${job.targetLevel}`;
}

export function stepLabel(step: UnitStep): string {
  return step.kind === "unlock"
    ? `Unlock ${step.unit.name}`
    : `Research ${step.unit.name} to level ${step.targetLevel}`;
}

export function startJob(step: UnitStep, seconds: number, now: number): LabJob {
  return { unitId: step.unit.id, targetLevel: step.targetLevel, finishAt: now + seconds * 1000 };
}

export function appliedUnits(catalog: Catalog, colony: LabColony, job: LabJob): UnitLevels {
  const unit = catalog.units.find((entry) => entry.id === job.unitId);
  const current = (unit ? unitLevel(catalog, unit, colony) : colony.units[job.unitId]) ?? 0;
  return { ...colony.units, [job.unitId]: Math.max(current, job.targetLevel) };
}

export function withUnitLevel(units: UnitLevels, unitId: string, level: number): UnitLevels {
  const { [unitId]: _, ...rest } = units;
  return level > 0 ? { ...rest, [unitId]: level } : rest;
}

export function labNotices(catalog: Catalog, store: ColonyStore): Notice[] {
  return COLONIES.flatMap((colony) => {
    const entry = store.get(colony.id);
    return (["research", "unlock"] as const).flatMap((kind) => {
      const job = entry?.[kind];
      if (!job) return [];
      return {
        key: `lab-${colony.id}-${kind}-${job.unitId}-${job.targetLevel}`,
        readyAt: job.finishAt,
        title: `${jobLabel(catalog, kind, job)} is finished`,
        body: `On ${colony.name}.`,
      };
    });
  });
}
