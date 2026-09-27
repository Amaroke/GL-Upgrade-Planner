import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

function firestoreOf(context: RulesTestContext): Firestore {
  return context.firestore() as unknown as Firestore;
}

const VALID_ENTRY = { readyAt: 1000, updatedAt: 500 };
const OWNER_PATH = "users/player-1/drops/gl-timer-star-battery";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-gl-upgrade-planner-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe("Firestore security rules", () => {
  it("lets a signed-in player read and write their own drop documents", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const ref = doc(db, OWNER_PATH);

    await assertSucceeds(setDoc(ref, VALID_ENTRY));
    const snapshot = await assertSucceeds(getDoc(ref));
    expect(snapshot.data()).toEqual(VALID_ENTRY);
  });

  it("denies another player from reading or writing those documents", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(firestoreOf(context), OWNER_PATH), VALID_ENTRY);
    });

    const db = firestoreOf(testEnv.authenticatedContext("player-2"));
    const ref = doc(db, OWNER_PATH);

    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, VALID_ENTRY));
  });

  it("denies unauthenticated reads and writes", async () => {
    const db = firestoreOf(testEnv.unauthenticatedContext());
    const ref = doc(db, OWNER_PATH);

    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, VALID_ENTRY));
  });

  it("rejects a write whose fields do not match the expected types", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const ref = doc(db, OWNER_PATH);

    await assertFails(setDoc(ref, { readyAt: "soon", updatedAt: 500 }));
    await assertFails(setDoc(ref, { readyAt: 1000, updatedAt: "500" }));
    await assertFails(setDoc(ref, { readyAt: 1000, updatedAt: 500, extra: true }));
  });

  it("rejects a write with a non-finite timestamp", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const ref = doc(db, OWNER_PATH);

    await assertFails(setDoc(ref, { readyAt: Number.NaN, updatedAt: 500 }));
    await assertFails(setDoc(ref, { readyAt: 1000, updatedAt: Number.POSITIVE_INFINITY }));
    await assertFails(setDoc(ref, { readyAt: -1, updatedAt: 500 }));
  });

  it("lets an owner delete their own drop document", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const ref = doc(db, OWNER_PATH);
    await assertSucceeds(setDoc(ref, VALID_ENTRY));

    await assertSucceeds(deleteDoc(ref));
  });

  it("denies another player from deleting that document", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(firestoreOf(context), OWNER_PATH), VALID_ENTRY);
    });

    const db = firestoreOf(testEnv.authenticatedContext("player-2"));
    await assertFails(deleteDoc(doc(db, OWNER_PATH)));
  });
});

const VALID_COLONY = { starBase: 5, buildings: { "gold-mine": [4, 2] }, updatedAt: 500 };
const COLONY_PATH = "users/player-1/colonies/main";

describe("Firestore security rules for Colonies", () => {
  it("lets a signed-in player read and write their own Colony documents", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const ref = doc(db, COLONY_PATH);

    await assertSucceeds(setDoc(ref, VALID_COLONY));
    const snapshot = await assertSucceeds(getDoc(ref));
    expect(snapshot.data()).toEqual(VALID_COLONY);
  });

  it("denies another player and unauthenticated visitors", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(firestoreOf(context), COLONY_PATH), VALID_COLONY);
    });

    for (const context of [
      testEnv.authenticatedContext("player-2"),
      testEnv.unauthenticatedContext(),
    ]) {
      const ref = doc(firestoreOf(context), COLONY_PATH);
      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref, VALID_COLONY));
      await assertFails(deleteDoc(ref));
    }
  });

  it("accepts the edges of the allowed bounds", async () => {
    const ref = doc(firestoreOf(testEnv.authenticatedContext("player-1")), COLONY_PATH);
    const manyTypes = Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [`type-${index}`, Array(500).fill(99)]),
    );

    await assertSucceeds(setDoc(ref, { starBase: 1, buildings: {}, updatedAt: 0 }));
    await assertSucceeds(setDoc(ref, { starBase: 20, buildings: manyTypes, updatedAt: 500 }));
    await assertSucceeds(
      setDoc(ref, { starBase: 5, buildings: { walls: Array(500).fill(1) }, updatedAt: 500 }),
    );
  });

  it("rejects unknown or missing keys", async () => {
    const ref = doc(firestoreOf(testEnv.authenticatedContext("player-1")), COLONY_PATH);

    await assertFails(setDoc(ref, { ...VALID_COLONY, extra: true }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, starBaseLevel: 5 }));
    await assertFails(setDoc(ref, { buildings: {}, updatedAt: 500 }));
    await assertFails(setDoc(ref, { starBase: 5, updatedAt: 500 }));
    await assertFails(setDoc(ref, { starBase: 5, buildings: {} }));
  });

  it("rejects out-of-bounds or mistyped values", async () => {
    const ref = doc(firestoreOf(testEnv.authenticatedContext("player-1")), COLONY_PATH);
    const tooManyTypes = Object.fromEntries(
      Array.from({ length: 31 }, (_, index) => [`type-${index}`, [1]]),
    );

    await assertFails(setDoc(ref, { ...VALID_COLONY, starBase: 0 }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, starBase: 21 }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, starBase: 5.5 }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, starBase: "5" }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, updatedAt: -1 }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, buildings: [] }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, buildings: { wall: 3 } }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, buildings: { wall: [0] } }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, buildings: { wall: [100] } }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, buildings: { wall: [2.5] } }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, buildings: { wall: ["3"] } }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, buildings: { walls: Array(501).fill(1) } }));
    await assertFails(setDoc(ref, { ...VALID_COLONY, buildings: tooManyTypes }));
  });

  describe("Constructions", () => {
    const CONSTRUCTION = "upgrade gold-mine 2 1 3 900";
    const MAIN_PLANET_COUNTS = [1, 12, 12, 5, 5, 1, 1, 2, 2, 2, 3, 1, 7, 7, 2, 2, 3, 3, 1, 4, 300];

    function withConstructions(constructions: unknown) {
      return { ...VALID_COLONY, constructions };
    }

    it("accepts valid Constructions up to the wide bounds", async () => {
      const ref = doc(firestoreOf(testEnv.authenticatedContext("player-1")), COLONY_PATH);
      const widest = `build ${"a".repeat(64)} 500 500 99 4102444799999`;

      await assertSucceeds(setDoc(ref, withConstructions([])));
      await assertSucceeds(setDoc(ref, withConstructions([CONSTRUCTION])));
      await assertSucceeds(setDoc(ref, withConstructions(Array(10).fill(widest))));
      const snapshot = await getDoc(ref);
      expect(snapshot.data()?.constructions).toHaveLength(10);
    });

    it("accepts ten Constructions on a fully built main planet", async () => {
      const ref = doc(firestoreOf(testEnv.authenticatedContext("player-1")), COLONY_PATH);
      const buildings = Object.fromEntries(
        MAIN_PLANET_COUNTS.map((count, index) => [`type-${index}`, Array(count).fill(11)]),
      );

      await assertSucceeds(
        setDoc(ref, {
          starBase: 20,
          buildings,
          constructions: Array(10).fill(CONSTRUCTION),
          updatedAt: 500,
        }),
      );
    });

    it("rejects malformed Constructions", async () => {
      const ref = doc(firestoreOf(testEnv.authenticatedContext("player-1")), COLONY_PATH);

      for (const constructions of [
        {},
        CONSTRUCTION,
        Array(11).fill(CONSTRUCTION),
        [`${CONSTRUCTION};${CONSTRUCTION}`, ...Array(9).fill(CONSTRUCTION)],
        [
          {
            kind: "upgrade",
            typeId: "gold-mine",
            instance: 2,
            count: 1,
            targetLevel: 3,
            finishAt: 900,
          },
        ],
        [5],
        ["upgrade gold-mine 2 1 3"],
        ["upgrade gold-mine 2 1 3 900 7"],
        ["repair gold-mine 2 1 3 900"],
        ["upgrade  2 1 3 900"],
        [`upgrade ${"a".repeat(65)} 2 1 3 900`],
        ["upgrade Gold-Mine 2 1 3 900"],
        ["upgrade gold-mine 0 1 3 900"],
        ["upgrade gold-mine 2 501 3 900"],
        ["upgrade gold-mine 2 1 100 900"],
        ["upgrade gold-mine 2 1 2.5 900"],
        ["upgrade gold-mine 2 1 3 -1"],
        ["upgrade gold-mine 2 1 3 41024447999990"],
      ]) {
        await assertFails(setDoc(ref, withConstructions(constructions)));
      }
    });
  });

  it("lets an owner delete their own Colony document", async () => {
    const ref = doc(firestoreOf(testEnv.authenticatedContext("player-1")), COLONY_PATH);
    await assertSucceeds(setDoc(ref, VALID_COLONY));

    await assertSucceeds(deleteDoc(ref));
  });
});

const VALID_SETTINGS = { onlyToUpgrade: true, hideWallUpgrades: false, updatedAt: 500 };
const SETTINGS_PATH = "users/player-1/settings/planner";

describe("Firestore security rules for settings", () => {
  it("lets a signed-in player read and write their own settings", async () => {
    const ref = doc(firestoreOf(testEnv.authenticatedContext("player-1")), SETTINGS_PATH);

    await assertSucceeds(setDoc(ref, VALID_SETTINGS));
    const snapshot = await assertSucceeds(getDoc(ref));
    expect(snapshot.data()).toEqual(VALID_SETTINGS);
  });

  it("denies another player and unauthenticated visitors", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(firestoreOf(context), SETTINGS_PATH), VALID_SETTINGS);
    });

    for (const context of [
      testEnv.authenticatedContext("player-2"),
      testEnv.unauthenticatedContext(),
    ]) {
      const ref = doc(firestoreOf(context), SETTINGS_PATH);
      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref, VALID_SETTINGS));
      await assertFails(deleteDoc(ref));
    }
  });

  it("rejects unknown, missing or mistyped fields", async () => {
    const ref = doc(firestoreOf(testEnv.authenticatedContext("player-1")), SETTINGS_PATH);

    await assertFails(setDoc(ref, { ...VALID_SETTINGS, extra: true }));
    await assertFails(setDoc(ref, { onlyToUpgrade: true, updatedAt: 500 }));
    await assertFails(setDoc(ref, { ...VALID_SETTINGS, onlyToUpgrade: "yes" }));
    await assertFails(setDoc(ref, { ...VALID_SETTINGS, hideWallUpgrades: 1 }));
    await assertFails(setDoc(ref, { ...VALID_SETTINGS, updatedAt: -1 }));
  });
});
