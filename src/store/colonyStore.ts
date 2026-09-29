import {
  createLocalStorageEntryStore,
  createMemoryEntryStore,
  type EntryStore,
} from "./entryStore";

export type ColonyBuildings = Record<string, number[]>;

export type Construction = {
  kind: "build" | "upgrade";
  typeId: string;
  instance: number;
  count: number;
  targetLevel: number;
  finishAt: number;
};

export type UnitLevels = Record<string, number>;

export type LabJob = {
  unitId: string;
  targetLevel: number;
  finishAt: number;
};

export type ColonyEntry = {
  starBaseLevel: number;
  buildings: ColonyBuildings;
  constructions?: Construction[];
  workers?: number;
  units?: UnitLevels;
  research?: LabJob;
  unlock?: LabJob;
  updatedAt: number;
};

export type ColonyStore = EntryStore<ColonyEntry>;

const STORAGE_PREFIX = "gl-colony-";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isColonyBuildings(value: unknown): value is ColonyBuildings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (levels) => Array.isArray(levels) && levels.every(isFiniteNumber),
  );
}

function isConstruction(value: unknown): value is Construction {
  if (typeof value !== "object" || value === null) return false;
  const { kind, typeId, instance, count, targetLevel, finishAt } = value as Record<string, unknown>;
  return (
    (kind === "build" || kind === "upgrade") &&
    typeof typeId === "string" &&
    [instance, count, targetLevel, finishAt].every(isFiniteNumber)
  );
}

function isUnitLevels(value: unknown): value is UnitLevels {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((level) => Number.isInteger(level) && level >= 1);
}

function isLabJob(value: unknown): value is LabJob {
  if (typeof value !== "object" || value === null) return false;
  const { unitId, targetLevel, finishAt } = value as Record<string, unknown>;
  return typeof unitId === "string" && [targetLevel, finishAt].every(isFiniteNumber);
}

function isWorkerCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

function sortedDescending(buildings: ColonyBuildings): ColonyBuildings {
  return Object.fromEntries(
    Object.entries(buildings).map(([id, levels]) => [id, [...levels].sort((a, b) => b - a)]),
  );
}

export function toColonyEntry(value: unknown): ColonyEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const {
    starBaseLevel,
    buildings = {},
    constructions,
    workers,
    units,
    research,
    unlock,
    updatedAt,
  } = value as Record<string, unknown>;
  if (!isFiniteNumber(starBaseLevel) || !isFiniteNumber(updatedAt)) return null;
  if (!isColonyBuildings(buildings)) return null;
  if (workers !== undefined && !isWorkerCount(workers)) return null;
  if (units !== undefined && !isUnitLevels(units)) return null;
  if (research !== undefined && !isLabJob(research)) return null;
  if (unlock !== undefined && !isLabJob(unlock)) return null;
  const entry: ColonyEntry = {
    starBaseLevel,
    buildings: sortedDescending(buildings),
    ...(workers === undefined ? {} : { workers }),
    ...(units === undefined ? {} : { units }),
    ...(research === undefined ? {} : { research }),
    ...(unlock === undefined ? {} : { unlock }),
    updatedAt,
  };
  if (constructions === undefined) return entry;
  if (!Array.isArray(constructions) || !constructions.every(isConstruction)) return null;
  return constructions.length > 0 ? { ...entry, constructions } : entry;
}

export function createLocalStorageColonyStore(): ColonyStore {
  return createLocalStorageEntryStore(STORAGE_PREFIX, toColonyEntry);
}

export function createMemoryColonyStore(): ColonyStore {
  return createMemoryEntryStore<ColonyEntry>();
}
