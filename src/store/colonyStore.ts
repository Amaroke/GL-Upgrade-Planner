import {
  createLocalStorageEntryStore,
  createMemoryEntryStore,
  type EntryStore,
} from "./entryStore";

export type ColonyBuildings = Record<string, number[]>;

export type ColonyEntry = {
  starBaseLevel: number;
  buildings: ColonyBuildings;
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

function sortedDescending(buildings: ColonyBuildings): ColonyBuildings {
  return Object.fromEntries(
    Object.entries(buildings).map(([id, levels]) => [id, [...levels].sort((a, b) => b - a)]),
  );
}

export function toColonyEntry(value: unknown): ColonyEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const { starBaseLevel, buildings = {}, updatedAt } = value as Record<string, unknown>;
  if (!isFiniteNumber(starBaseLevel) || !isFiniteNumber(updatedAt)) return null;
  if (!isColonyBuildings(buildings)) return null;
  return { starBaseLevel, buildings: sortedDescending(buildings), updatedAt };
}

export function createLocalStorageColonyStore(): ColonyStore {
  return createLocalStorageEntryStore(STORAGE_PREFIX, toColonyEntry);
}

export function createMemoryColonyStore(): ColonyStore {
  return createMemoryEntryStore<ColonyEntry>();
}
