import { describe, expect, it } from "vitest";
import type { ColonyEntry } from "./colonyStore";
import { COLONY_CODEC } from "./firestoreColonyStore";

const LABORATORY_ENTRY: ColonyEntry = {
  starBaseLevel: 4,
  buildings: { laboratory: [2] },
  units: { marine: 3, looter: 1 },
  research: { unitId: "marine", targetLevel: 4, finishAt: 1790000000000 },
  unlock: { unitId: "bazooka", targetLevel: 1, finishAt: 1790000000500 },
  updatedAt: 700,
};

describe("COLONY_CODEC", () => {
  it("stores the Unit levels as a map and each Laboratory job as one line", () => {
    expect(COLONY_CODEC.toDocument(LABORATORY_ENTRY)).toEqual({
      starBase: 4,
      buildings: { laboratory: [2] },
      units: { marine: 3, looter: 1 },
      research: "marine 4 1790000000000",
      unlock: "bazooka 1 1790000000500",
      updatedAt: 700,
    });
  });

  it("reads the Unit levels, the Research and the Unlock back", () => {
    expect(COLONY_CODEC.fromDocument(COLONY_CODEC.toDocument(LABORATORY_ENTRY))).toEqual(
      LABORATORY_ENTRY,
    );
  });

  it("leaves out the Laboratory fields of a Colony without them", () => {
    const entry: ColonyEntry = { starBaseLevel: 2, buildings: {}, updatedAt: 5 };

    expect(COLONY_CODEC.toDocument(entry)).toEqual({ starBase: 2, buildings: {}, updatedAt: 5 });
    expect(COLONY_CODEC.fromDocument({ starBase: 2, buildings: {}, updatedAt: 5 })).toEqual(entry);
  });
});
