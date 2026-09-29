import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ColonyEntry } from "./colonyStore";
import { createFirestoreColonyStore } from "./firestoreColonyStore";
import { createSendScheduler } from "./sendScheduler";

function createStore(db: Firestore) {
  return createFirestoreColonyStore(db, "player-1", createSendScheduler());
}

function firestoreOf(context: RulesTestContext): Firestore {
  return context.firestore() as unknown as Firestore;
}

function waitFor(store: ReturnType<typeof createStore>, colonyId: string, updatedAt: number) {
  return new Promise<void>((resolve) => {
    const unsubscribe = store.subscribe(colonyId, () => {
      if (store.get(colonyId)?.updatedAt !== updatedAt) return;
      unsubscribe();
      resolve();
    });
    if (store.get(colonyId)?.updatedAt === updatedAt) {
      unsubscribe();
      resolve();
    }
  });
}

const ENTRY: ColonyEntry = {
  starBaseLevel: 5,
  buildings: { "gold-mine": [4, 2], observatory: [3] },
  updatedAt: 500,
};

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-gl-upgrade-planner-colony-adapter",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe("createFirestoreColonyStore", () => {
  it("returns null for a Colony that was never saved", () => {
    const store = createStore(firestoreOf(testEnv.authenticatedContext("player-1")));

    expect(store.get("main")).toBeNull();
  });

  it("reflects a Colony synchronously right after writing it", () => {
    const store = createStore(firestoreOf(testEnv.authenticatedContext("player-1")));

    store.set("main", ENTRY);

    expect(store.get("main")).toEqual(ENTRY);
  });

  it("writes the Colony document under the player's colonies collection", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const store = createStore(db);

    store.set("colony-3", ENTRY);
    store.syncStatus.saveNow();
    await waitFor(store, "colony-3", 500);
    await new Promise<void>((resolve) => {
      const unsubscribe = store.syncStatus.subscribe(() => {
        if (store.syncStatus.getStatus() !== "synced") return;
        unsubscribe();
        resolve();
      });
      if (store.syncStatus.getStatus() === "synced") resolve();
    });

    const snapshot = await getDoc(doc(db, "users", "player-1", "colonies", "colony-3"));
    expect(snapshot.data()).toEqual({
      starBase: 5,
      buildings: { "gold-mine": [4, 2], observatory: [3] },
      updatedAt: 500,
    });
  });

  it("reads a Colony document written by another device", async () => {
    await setDoc(
      doc(firestoreOf(testEnv.authenticatedContext("player-1")), "users/player-1/colonies/main"),
      { starBase: 7, buildings: { "gold-mine": [2, 6] }, updatedAt: 900 },
    );
    const store = createStore(firestoreOf(testEnv.authenticatedContext("player-1")));

    await waitFor(store, "main", 900);

    expect(store.get("main")).toEqual({
      starBaseLevel: 7,
      buildings: { "gold-mine": [6, 2] },
      updatedAt: 900,
    });
  });

  it("notifies subscribers when another writer changes the same Colony", async () => {
    const writerStore = createStore(firestoreOf(testEnv.authenticatedContext("player-1")));
    const readerStore = createStore(firestoreOf(testEnv.authenticatedContext("player-1")));
    readerStore.get("main");

    const received = waitFor(readerStore, "main", 500);
    writerStore.set("main", ENTRY);
    writerStore.syncStatus.saveNow();
    await received;

    expect(readerStore.get("main")).toEqual(ENTRY);
  });

  it("stores each Construction as one line with the Worker count and reads them back", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const writer = createStore(db);
    const entry: ColonyEntry = {
      ...ENTRY,
      constructions: [
        {
          kind: "upgrade",
          typeId: "gold-mine",
          instance: 2,
          count: 1,
          targetLevel: 3,
          finishAt: 1790000000000,
        },
      ],
      workers: 2,
      updatedAt: 700,
    };

    writer.set("main", entry);
    writer.syncStatus.saveNow();
    await new Promise<void>((resolve) => {
      const unsubscribe = writer.syncStatus.subscribe(() => {
        if (writer.syncStatus.getStatus() !== "synced") return;
        unsubscribe();
        resolve();
      });
    });

    const snapshot = await getDoc(doc(db, "users/player-1/colonies/main"));
    expect(snapshot.data()?.constructions).toEqual(["upgrade gold-mine 2 1 3 1790000000000"]);
    expect(snapshot.data()?.workers).toBe(2);
    const reader = createStore(firestoreOf(testEnv.authenticatedContext("player-1")));
    reader.get("main");
    await waitFor(reader, "main", 700);
    expect(reader.get("main")).toEqual(entry);
  });

  it("stores the Unit levels, the Research and the Unlock and reads them back", async () => {
    const db = firestoreOf(testEnv.authenticatedContext("player-1"));
    const writer = createStore(db);
    const entry: ColonyEntry = {
      ...ENTRY,
      units: { marine: 3, looter: 1 },
      research: { unitId: "marine", targetLevel: 4, finishAt: 1790000000000 },
      unlock: { unitId: "bazooka", targetLevel: 1, finishAt: 1790000000500 },
      updatedAt: 800,
    };

    writer.set("main", entry);
    writer.syncStatus.saveNow();
    await new Promise<void>((resolve) => {
      const unsubscribe = writer.syncStatus.subscribe(() => {
        if (writer.syncStatus.getStatus() !== "synced") return;
        unsubscribe();
        resolve();
      });
    });

    const snapshot = await getDoc(doc(db, "users/player-1/colonies/main"));
    expect(snapshot.data()?.units).toEqual({ marine: 3, looter: 1 });
    expect(snapshot.data()?.research).toBe("marine 4 1790000000000");
    expect(snapshot.data()?.unlock).toBe("bazooka 1 1790000000500");
    const reader = createStore(firestoreOf(testEnv.authenticatedContext("player-1")));
    reader.get("main");
    await waitFor(reader, "main", 800);
    expect(reader.get("main")).toEqual(entry);
  });
});
