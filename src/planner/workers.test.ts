import { describe, expect, it } from "vitest";
import type { BuildingType, Catalog } from "./catalog";
import { idleWorkers, runningConstructions, totalIdleWorkers } from "./workers";
import { createMemoryColonyStore, type ColonyEntry, type Construction } from "../store/colonyStore";

const NOW = 1_000_000;

function type(id: string, limits: [number, number][], mainOnly = false): BuildingType {
  return {
    id,
    name: id,
    category: "Resource",
    mainOnly,
    unlocks: limits.map(([maxCount, maxLevel], index) => ({
      starBase: index + 1,
      maxCount,
      maxLevel,
    })),
    levels: [1, 2, 3].map((level) => ({ level, time: "1m" })),
  };
}

const CATALOG: Catalog = {
  version: 1,
  starBase: [],
  units: [],
  buildings: [
    type("observatory", [[1, 3]], true),
    type("mine", [[1, 2]]),
    { ...type("wall", [[2, 3]]), sharedLevel: true },
  ],
};

function upgradeMine(finishAt: number): Construction {
  return { kind: "upgrade", typeId: "mine", instance: 1, count: 1, targetLevel: 2, finishAt };
}

function colony(changes: Partial<ColonyEntry> = {}): ColonyEntry {
  return { starBaseLevel: 1, buildings: { mine: [1], wall: [3, 3] }, updatedAt: 1, ...changes };
}

describe("idleWorkers", () => {
  it("counts one idle Worker by default when something is left to start", () => {
    expect(idleWorkers(CATALOG, "colony-1", colony(), false, NOW)).toBe(1);
  });

  it("counts one idle Worker on a Colony never set", () => {
    expect(idleWorkers(CATALOG, "colony-1", null, false, NOW)).toBe(1);
  });

  it("counts the Workers left free by running Constructions", () => {
    const entry = colony({
      buildings: { wall: [1, 1] },
      workers: 3,
      constructions: [upgradeMine(NOW + 1)],
    });
    expect(idleWorkers(CATALOG, "colony-1", entry, false, NOW)).toBe(2);
  });

  it("counts none when every Worker is busy", () => {
    const entry = colony({ constructions: [upgradeMine(NOW + 1)] });
    expect(idleWorkers(CATALOG, "colony-1", entry, false, NOW)).toBe(0);
  });

  it("counts none when every Worker is busy and more Constructions run than Workers", () => {
    const entry = colony({
      buildings: { wall: [1, 1] },
      constructions: [upgradeMine(NOW + 1), upgradeMine(NOW + 1)],
    });
    expect(idleWorkers(CATALOG, "colony-1", entry, false, NOW)).toBe(0);
  });

  it("frees the Worker of a Finished Construction", () => {
    const entry = colony({ buildings: { wall: [1, 1] }, constructions: [upgradeMine(NOW)] });
    expect(idleWorkers(CATALOG, "colony-1", entry, false, NOW)).toBe(1);
  });

  it("counts none when nothing is left to start", () => {
    const entry = colony({ buildings: { mine: [2], wall: [3, 3] }, workers: 2 });
    expect(idleWorkers(CATALOG, "colony-1", entry, false, NOW)).toBe(0);
  });

  it("counts none when the only step left is started", () => {
    const entry = colony({ workers: 2, constructions: [upgradeMine(NOW + 1)] });
    expect(idleWorkers(CATALOG, "colony-1", entry, false, NOW)).toBe(0);
  });

  it("ignores wall upgrades when they are hidden", () => {
    const entry = colony({ buildings: { mine: [2], wall: [1, 1] } });
    expect(idleWorkers(CATALOG, "colony-1", entry, false, NOW)).toBe(1);
    expect(idleWorkers(CATALOG, "colony-1", entry, true, NOW)).toBe(0);
  });
});

describe("totalIdleWorkers", () => {
  it("adds the idle Workers of every unlocked Colony and skips locked ones", () => {
    const store = createMemoryColonyStore();
    store.set("main", colony({ buildings: { observatory: [1], mine: [1] }, workers: 2 }));
    store.set("colony-1", colony({ workers: 3 }));
    store.set("colony-2", colony({ workers: 5 }));

    expect(totalIdleWorkers(CATALOG, store, false, NOW)).toBe(5);
  });

  it("leaves out the Workers freed by Finished Constructions, already counted as Finished", () => {
    const store = createMemoryColonyStore();
    store.set(
      "main",
      colony({
        buildings: { observatory: [1], mine: [1], wall: [1, 1] },
        workers: 3,
        constructions: [upgradeMine(NOW), upgradeMine(NOW + 1)],
      }),
    );
    store.set("colony-1", colony({ constructions: [upgradeMine(NOW - 1)] }));

    expect(totalIdleWorkers(CATALOG, store, false, NOW)).toBe(1);
  });
});

describe("runningConstructions", () => {
  it("keeps only the Constructions not yet Finished", () => {
    const running = upgradeMine(NOW + 1);
    expect(runningConstructions([upgradeMine(NOW), running, upgradeMine(NOW - 1)], NOW)).toEqual([
      running,
    ]);
  });
});
