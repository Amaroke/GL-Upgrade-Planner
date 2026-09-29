import { describe, expect, it } from "vitest";
import type { Catalog, UnitType } from "./catalog";
import { idleLaboratory, totalIdleLaboratories } from "./laboratory";
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

describe("idleLaboratory", () => {
  it("is idle when nothing runs and a step is left to start", () => {
    expect(idleLaboratory(CATALOG, colony(), NOW)).toBe(true);
  });

  it("is idle with only a Research left to start", () => {
    expect(idleLaboratory(CATALOG, colony({ units: { looter: 1 } }), NOW)).toBe(true);
  });

  it("is idle with only an Unlock left to start", () => {
    expect(idleLaboratory(CATALOG, colony({ units: { marine: 2 } }), NOW)).toBe(true);
  });

  it("is not idle while a Research runs", () => {
    const entry = colony({ research: job("marine", 2, NOW + 1) });
    expect(idleLaboratory(CATALOG, entry, NOW)).toBe(false);
  });

  it("is not idle while an Unlock runs", () => {
    const entry = colony({ unlock: job("looter", 1, NOW + 1) });
    expect(idleLaboratory(CATALOG, entry, NOW)).toBe(false);
  });

  it("is not idle when nothing is left to start", () => {
    const entry = colony({ units: { marine: 2, looter: 2 } });
    expect(idleLaboratory(CATALOG, entry, NOW)).toBe(false);
  });

  it("is not idle without a Laboratory", () => {
    const entry = colony({ buildings: { "training-camp": [1] } });
    expect(idleLaboratory(CATALOG, entry, NOW)).toBe(false);
  });

  it("is not idle on a Colony never set", () => {
    expect(idleLaboratory(CATALOG, null, NOW)).toBe(false);
  });

  it("is not idle while the Laboratory is upgraded and only Research is left", () => {
    const entry = colony({
      units: { looter: 1 },
      constructions: [
        {
          kind: "upgrade",
          typeId: "laboratory",
          instance: 1,
          count: 1,
          targetLevel: 2,
          finishAt: NOW + 1,
        },
      ],
    });
    expect(idleLaboratory(CATALOG, entry, NOW)).toBe(false);
  });

  it("is idle once its job is Finished and another step is left in a free slot", () => {
    const entry = colony({ research: job("marine", 2, NOW) });
    expect(idleLaboratory(CATALOG, entry, NOW)).toBe(true);
  });

  it("is not idle when the only free slot has nothing to start", () => {
    const entry = colony({ units: { looter: 2 }, research: job("marine", 2, NOW) });
    expect(idleLaboratory(CATALOG, entry, NOW)).toBe(false);
  });
});

describe("totalIdleLaboratories", () => {
  it("counts each unlocked Colony with an idle Laboratory", () => {
    const store = createMemoryColonyStore();
    store.set("main", colony({ buildings: { ...colony().buildings, observatory: [1] } }));
    store.set("colony-1", colony());
    store.set("colony-2", colony());
    expect(totalIdleLaboratories(CATALOG, store, NOW)).toBe(2);
  });

  it("counts a Laboratory with a Finished job once, not as idle too", () => {
    const store = createMemoryColonyStore();
    store.set("main", colony({ research: job("marine", 2, NOW) }));
    expect(totalIdleLaboratories(CATALOG, store, NOW)).toBe(0);
  });
});
