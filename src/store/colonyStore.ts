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

export type ColonyEntry = {
  starBaseLevel: number;
  buildings: ColonyBuildings;
  constructions?: Construction[];
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
    updatedAt,
  } = value as Record<string, unknown>;
  if (!isFiniteNumber(starBaseLevel) || !isFiniteNumber(updatedAt)) return null;
  if (!isColonyBuildings(buildings)) return null;
  const entry: ColonyEntry = { starBaseLevel, buildings: sortedDescending(buildings), updatedAt };
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
