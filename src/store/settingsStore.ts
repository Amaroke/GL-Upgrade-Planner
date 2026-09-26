import {
  createLocalStorageEntryStore,
  createMemoryEntryStore,
  type EntryStore,
} from "./entryStore";

export type PlannerSettings = {
  onlyToUpgrade: boolean;
  hideWallUpgrades: boolean;
  updatedAt: number;
};

export type SettingsStore = EntryStore<PlannerSettings>;

export const PLANNER_SETTINGS_KEY = "planner";
export const SETTINGS_KEYS = [PLANNER_SETTINGS_KEY];

const STORAGE_PREFIX = "gl-settings-";

export function toPlannerSettings(value: unknown): PlannerSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const {
    onlyToUpgrade = false,
    hideWallUpgrades = false,
    updatedAt,
  } = value as Record<string, unknown>;
  if (typeof onlyToUpgrade !== "boolean" || typeof hideWallUpgrades !== "boolean") return null;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
  return { onlyToUpgrade, hideWallUpgrades, updatedAt };
}

export function createLocalStorageSettingsStore(): SettingsStore {
  return createLocalStorageEntryStore(STORAGE_PREFIX, toPlannerSettings);
}

export function createMemorySettingsStore(): SettingsStore {
  return createMemoryEntryStore<PlannerSettings>();
}

const LEGACY_ONLY_TO_UPGRADE_KEY = "gl-planner-only-to-upgrade";

export function migrateLegacyOnlyToUpgrade(store: SettingsStore): void {
  try {
    const legacy = localStorage.getItem(LEGACY_ONLY_TO_UPGRADE_KEY);
    if (legacy === null) return;
    if (!store.get(PLANNER_SETTINGS_KEY)) {
      store.set(PLANNER_SETTINGS_KEY, {
        onlyToUpgrade: legacy === "true",
        hideWallUpgrades: false,
        updatedAt: 0,
      });
    }
    localStorage.removeItem(LEGACY_ONLY_TO_UPGRADE_KEY);
  } catch {
    return;
  }
}
