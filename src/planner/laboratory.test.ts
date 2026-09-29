import { describe, expect, it } from "vitest";
import type { Catalog, UnitType } from "./catalog";
import { idleLabSlots, totalIdleLabSlots } from "./laboratory";
import { createMemoryColonyStore, type ColonyEntry, type LabJob } from "../store/colonyStore";

const NOW = 1_000_000;

function unit(id: string, startsUnlocked: boolean, laboratories: number[]): UnitType {
  return {
    id,
    name: id,
    category: "Infantry",
    building: "training-camp",
    starBase: 1,
    startsUnlocked,
    unlockTime: startsUnlocked ? null : "30m",
    levels: laboratories.map((laboratory, index) => ({
      level: index + 2,
      laboratory,
      time: "1h",
    })),
  };
}

const CATALOG: Catalog = {
  version: 1,
  starBase: [],
  buildings: [],
  units: [unit("marine", true, [1, 2]), unit("looter", false, [1, 2])],
};

function job(unitId: string, targetLevel: number, finishAt: number): LabJob {
  return { unitId, targetLevel, finishAt };
}

function colony(changes: Partial<ColonyEntry> = {}): ColonyEntry {
  return {
    starBaseLevel: 1,
    buildings: { "training-camp": [1], laboratory: [1] },
    updatedAt: 1,
    ...changes,
  };
}

const LAB_UPGRADE = {
  kind: "upgrade" as const,
  typeId: "laboratory",
  instance: 1,
  count: 1,
  targetLevel: 2,
  finishAt: NOW + 1,
};

describe("idleLabSlots", () => {
  it("counts both slots when nothing runs and both have a step to start", () => {
    expect(idleLabSlots(CATALOG, colony(), NOW)).toEqual(["research", "unlock"]);
  });

  it("counts only the Research slot when no Unlock is left", () => {
    expect(idleLabSlots(CATALOG, colony({ units: { looter: 1 } }), NOW)).toEqual(["research"]);
  });

  it("counts only the Unlock slot when no Research is left", () => {
    expect(idleLabSlots(CATALOG, colony({ units: { marine: 2 } }), NOW)).toEqual(["unlock"]);
  });

  it("counts the Unlock slot while a Research runs", () => {
    const entry = colony({ research: job("marine", 2, NOW + 1) });
    expect(idleLabSlots(CATALOG, entry, NOW)).toEqual(["unlock"]);
  });

  it("counts the Research slot while an Unlock runs", () => {
    const entry = colony({ unlock: job("looter", 1, NOW + 1) });
    expect(idleLabSlots(CATALOG, entry, NOW)).toEqual(["research"]);
  });

  it("counts no slot holding a Finished job, already counted as Finished", () => {
    const entry = colony({ research: job("marine", 2, NOW) });
    expect(idleLabSlots(CATALOG, entry, NOW)).toEqual(["unlock"]);
  });

  it("counts none when nothing is left to start", () => {
    const entry = colony({ units: { marine: 2, looter: 2 } });
    expect(idleLabSlots(CATALOG, entry, NOW)).toEqual([]);
  });

  it("counts none without a Laboratory", () => {
    const entry = colony({ buildings: { "training-camp": [1] } });
    expect(idleLabSlots(CATALOG, entry, NOW)).toEqual([]);
  });

  it("counts none on a Colony never set", () => {
    expect(idleLabSlots(CATALOG, null, NOW)).toEqual([]);
  });

  it("skips the Research slot while the Laboratory is upgraded", () => {
    const entry = colony({ constructions: [LAB_UPGRADE] });
    expect(idleLabSlots(CATALOG, entry, NOW)).toEqual(["unlock"]);
  });
});

describe("totalIdleLabSlots", () => {
  it("adds the idle slots of every unlocked Colony", () => {
    const store = createMemoryColonyStore();
    store.set("main", colony({ buildings: { ...colony().buildings, observatory: [1] } }));
    store.set("colony-1", colony({ units: { looter: 1 } }));
    store.set("colony-2", colony());
    expect(totalIdleLabSlots(CATALOG, store, NOW)).toBe(3);
  });
});
