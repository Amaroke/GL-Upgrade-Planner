import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mergeLocalIntoAccount } from "./accountSync";
import { createMemoryColonyStore, type ColonyStore } from "./colonyStore";
import { createMemoryDropStore, type DropStore } from "./dropStore";
import { createMemorySettingsStore, type SettingsStore } from "./settingsStore";

function firestoreOf(context: RulesTestContext): Firestore {
  return context.firestore() as unknown as Firestore;
}

const KEYS = ["gl-timer-star-battery", "gl-timer-tool-case"];
const COLONY_IDS = ["main", "colony-1"];

function merge(
  db: Firestore,
  local: { drops?: DropStore; colonies?: ColonyStore; settings?: SettingsStore },
): Promise<void> {
  return mergeLocalIntoAccount(db, "player-1", {
    drops: local.drops ?? createMemoryDropStore(),
    colonies: local.colonies ?? createMemoryColonyStore(),
    settings: local.settings ?? createMemorySettingsStore(),
    dropKeys: KEYS,
    colonyIds: COLONY_IDS,
    settingsKeys: ["planner"],
  });
}

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-gl-upgrade-planner-sync",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe("mergeLocalIntoAccount drops", () => {
  it("writes the local value when the account has no document yet", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const localStore = createMemoryDropStore();
    localStore.set("gl-timer-star-battery", 1000, 500);

    await merge(db, { drops: localStore });

    const snapshot = await getDoc(doc(db, "users/player-1/drops/gl-timer-star-battery"));
    expect(snapshot.data()).toEqual({ readyAt: 1000, updatedAt: 500 });
  });

  it("replaces the account value when the local one is more recent", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    await setDoc(doc(db, "users/player-1/drops/gl-timer-star-battery"), {
      readyAt: 2000,
      updatedAt: 100,
    });
    const localStore = createMemoryDropStore();
    localStore.set("gl-timer-star-battery", 1000, 500);

    await merge(db, { drops: localStore });

    const snapshot = await getDoc(doc(db, "users/player-1/drops/gl-timer-star-battery"));
    expect(snapshot.data()).toEqual({ readyAt: 1000, updatedAt: 500 });
  });

  it("keeps the account value when it is more recent than the local one", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    await setDoc(doc(db, "users/player-1/drops/gl-timer-star-battery"), {
      readyAt: 2000,
      updatedAt: 900,
    });
    const localStore = createMemoryDropStore();
    localStore.set("gl-timer-star-battery", 1000, 500);

    await merge(db, { drops: localStore });

    const snapshot = await getDoc(doc(db, "users/player-1/drops/gl-timer-star-battery"));
    expect(snapshot.data()).toEqual({ readyAt: 2000, updatedAt: 900 });
  });

  it("keeps the account value when both share the same updated-at", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    await setDoc(doc(db, "users/player-1/drops/gl-timer-star-battery"), {
      readyAt: 2000,
      updatedAt: 500,
    });
    const localStore = createMemoryDropStore();
    localStore.set("gl-timer-star-battery", 1000, 500);

    await merge(db, { drops: localStore });

    const snapshot = await getDoc(doc(db, "users/player-1/drops/gl-timer-star-battery"));
    expect(snapshot.data()).toEqual({ readyAt: 2000, updatedAt: 500 });
  });

  it("does nothing for a key with no local value", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const localStore = createMemoryDropStore();

    await merge(db, { drops: localStore });

    const snapshot = await getDoc(doc(db, "users/player-1/drops/gl-timer-star-battery"));
    expect(snapshot.exists()).toBe(false);
  });

  it("merges each key independently", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    await setDoc(doc(db, "users/player-1/drops/gl-timer-tool-case"), {
      readyAt: 8000,
      updatedAt: 900,
    });
    const localStore = createMemoryDropStore();
    localStore.set("gl-timer-star-battery", 1000, 500);
    localStore.set("gl-timer-tool-case", 3000, 100);

    await merge(db, { drops: localStore });

    const starBattery = await getDoc(doc(db, "users/player-1/drops/gl-timer-star-battery"));
    const toolCase = await getDoc(doc(db, "users/player-1/drops/gl-timer-tool-case"));
    expect(starBattery.data()).toEqual({ readyAt: 1000, updatedAt: 500 });
    expect(toolCase.data()).toEqual({ readyAt: 8000, updatedAt: 900 });
  });
});

describe("mergeLocalIntoAccount colonies", () => {
  const MAIN = "users/player-1/colonies/main";

  function localColonies(starBaseLevel: number, updatedAt: number) {
    const colonies = createMemoryColonyStore();
    colonies.set("main", { starBaseLevel, buildings: { "gold-mine": [3, 1] }, updatedAt });
    return colonies;
  }

  it("imports a local Colony the account does not have yet", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));

    await merge(db, { colonies: localColonies(4, 500) });

    const snapshot = await getDoc(doc(db, MAIN));
    expect(snapshot.data()).toEqual({
      starBase: 4,
      buildings: { "gold-mine": [3, 1] },
      updatedAt: 500,
    });
  });

  it("imports a local Colony more recent than the account one", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    await setDoc(doc(db, MAIN), { starBase: 2, buildings: {}, updatedAt: 100 });

    await merge(db, { colonies: localColonies(4, 500) });

    const snapshot = await getDoc(doc(db, MAIN));
    expect(snapshot.data()).toMatchObject({ starBase: 4, updatedAt: 500 });
  });

  it("keeps the account Colony when it is more recent than the local one", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    await setDoc(doc(db, MAIN), { starBase: 7, buildings: {}, updatedAt: 900 });

    await merge(db, { colonies: localColonies(4, 500) });

    const snapshot = await getDoc(doc(db, MAIN));
    expect(snapshot.data()).toEqual({ starBase: 7, buildings: {}, updatedAt: 900 });
  });

  it("keeps the account Colony when both share the same updated-at", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    await setDoc(doc(db, MAIN), { starBase: 7, buildings: {}, updatedAt: 500 });

    await merge(db, { colonies: localColonies(4, 500) });

    const snapshot = await getDoc(doc(db, MAIN));
    expect(snapshot.data()).toEqual({ starBase: 7, buildings: {}, updatedAt: 500 });
  });

  it("leaves a Colony with no local value untouched", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));

    await merge(db, { colonies: localColonies(4, 500) });

    const snapshot = await getDoc(doc(db, "users/player-1/colonies/colony-1"));
    expect(snapshot.exists()).toBe(false);
  });
});

describe("mergeLocalIntoAccount settings", () => {
  const PLANNER = "users/player-1/settings/planner";

  function localSettings(updatedAt: number) {
    const settings = createMemorySettingsStore();
    settings.set("planner", { onlyToUpgrade: true, hideWallUpgrades: true, updatedAt });
    return settings;
  }

  it("imports local settings the account does not have yet", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));

    await merge(db, { settings: localSettings(500) });

    const snapshot = await getDoc(doc(db, PLANNER));
    expect(snapshot.data()).toEqual({
      onlyToUpgrade: true,
      hideWallUpgrades: true,
      updatedAt: 500,
    });
  });

  it("keeps the account settings when they are more recent than the local ones", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const account = { onlyToUpgrade: false, hideWallUpgrades: false, updatedAt: 900 };
    await setDoc(doc(db, PLANNER), account);

    await merge(db, { settings: localSettings(500) });

    const snapshot = await getDoc(doc(db, PLANNER));
    expect(snapshot.data()).toEqual(account);
  });
});
