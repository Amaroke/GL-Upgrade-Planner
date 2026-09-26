import { afterEach, describe, expect, it } from "vitest";
import {
  createLocalStorageSettingsStore,
  migrateLegacyOnlyToUpgrade,
  toPlannerSettings,
} from "./settingsStore";

describe("toPlannerSettings", () => {
  it("defaults missing options to off", () => {
    expect(toPlannerSettings({ updatedAt: 5 })).toEqual({
      onlyToUpgrade: false,
      hideWallUpgrades: false,
      updatedAt: 5,
    });
  });

  it("rejects mistyped values", () => {
    expect(toPlannerSettings(null)).toBeNull();
    expect(toPlannerSettings({ onlyToUpgrade: "yes", updatedAt: 5 })).toBeNull();
    expect(toPlannerSettings({ hideWallUpgrades: 1, updatedAt: 5 })).toBeNull();
    expect(toPlannerSettings({ onlyToUpgrade: true })).toBeNull();
    expect(toPlannerSettings({ onlyToUpgrade: true, updatedAt: Number.NaN })).toBeNull();
  });
});

describe("createLocalStorageSettingsStore", () => {
  afterEach(() => localStorage.clear());

  it("keeps the settings across store instances", () => {
    const settings = { onlyToUpgrade: true, hideWallUpgrades: true, updatedAt: 10 };
    createLocalStorageSettingsStore().set("planner", settings);

    expect(createLocalStorageSettingsStore().get("planner")).toEqual(settings);
  });

  it("returns null for corrupted settings", () => {
    localStorage.setItem("gl-settings-planner", "{not json");

    expect(createLocalStorageSettingsStore().get("planner")).toBeNull();
  });
});

describe("migrateLegacyOnlyToUpgrade", () => {
  afterEach(() => localStorage.clear());

  it("moves the filter saved before the settings into the settings, older than any edit", () => {
    localStorage.setItem("gl-planner-only-to-upgrade", "true");
    const store = createLocalStorageSettingsStore();

    migrateLegacyOnlyToUpgrade(store);

    expect(store.get("planner")).toEqual({
      onlyToUpgrade: true,
      hideWallUpgrades: false,
      updatedAt: 0,
    });
    expect(localStorage.getItem("gl-planner-only-to-upgrade")).toBeNull();
  });

  it("keeps settings already saved", () => {
    localStorage.setItem("gl-planner-only-to-upgrade", "true");
    const store = createLocalStorageSettingsStore();
    const saved = { onlyToUpgrade: false, hideWallUpgrades: true, updatedAt: 10 };
    store.set("planner", saved);

    migrateLegacyOnlyToUpgrade(store);

    expect(store.get("planner")).toEqual(saved);
  });

  it("does nothing without a legacy filter", () => {
    const store = createLocalStorageSettingsStore();

    migrateLegacyOnlyToUpgrade(store);

    expect(store.get("planner")).toBeNull();
  });
});
