import { describe, expect, it } from "vitest";
import { groupedBuildingsForColony } from "./buildings";
import type { BuildingType, Catalog } from "./catalog";
import { filterToUpgrade, instanceStatus, needsUpgrade, typeStatuses, unlocksAt } from "./statuses";

function type(id: string, limits: [number, number][]): BuildingType {
  return {
    id,
    name: id,
    category: "Resource",
    mainOnly: false,
    unlocks: limits.map(([maxCount, maxLevel], index) => ({
      starBase: index + 1,
      maxCount,
      maxLevel,
    })),
    levels: [],
  };
}

const MINE = type("mine", [
  [2, 3],
  [3, 5],
]);

const LASER = type("laser", [
  [0, 0],
  [0, 0],
  [1, 3],
  [2, 4],
]);

describe("typeStatuses", () => {
  it("flags Missing when the owned count is below the maximum count", () => {
    expect(typeStatuses(MINE, 1, [3])).toEqual(["missing"]);
  });

  it("flags Missing when none is owned", () => {
    expect(typeStatuses(MINE, 1, [])).toEqual(["missing"]);
  });

  it("flags Below limit when a Building is below the maximum level", () => {
    expect(typeStatuses(MINE, 1, [3, 2])).toEqual(["below-limit"]);
  });

  it("flags both Missing and Below limit when both apply", () => {
    expect(typeStatuses(MINE, 1, [2])).toEqual(["missing", "below-limit"]);
  });

  it("flags Maxed when nothing is left to build or upgrade", () => {
    expect(typeStatuses(MINE, 1, [3, 3])).toEqual(["maxed"]);
  });

  it("flags Over limit when a level exceeds the maximum level", () => {
    expect(typeStatuses(MINE, 1, [5, 3])).toEqual(["over-limit"]);
  });

  it("flags Over limit when the count exceeds the maximum count", () => {
    expect(typeStatuses(MINE, 1, [3, 3, 3])).toEqual(["over-limit"]);
  });

  it("flags Over limit alongside Below limit", () => {
    expect(typeStatuses(MINE, 1, [5, 2])).toEqual(["below-limit", "over-limit"]);
  });

  it("does not flag Maxed while data is Over limit", () => {
    expect(typeStatuses(MINE, 1, [5, 3])).not.toContain("maxed");
  });

  it("never flags Missing or Maxed on a type not unlocked yet", () => {
    expect(typeStatuses(LASER, 1, [])).toEqual([]);
  });

  it("flags Over limit on a type not unlocked yet that still has Buildings", () => {
    expect(typeStatuses(LASER, 1, [2])).toEqual(["over-limit"]);
  });

  it("flags data as Over limit after the Star Base level is lowered, without changing it", () => {
    const levels = [5, 4, 3];
    expect(typeStatuses(MINE, 2, levels)).toEqual(["below-limit"]);
    expect(typeStatuses(MINE, 1, levels)).toEqual(["over-limit"]);
    expect(levels).toEqual([5, 4, 3]);
  });
});

describe("instanceStatus", () => {
  const limits = { starBase: 1, maxCount: 2, maxLevel: 3 };

  it("flags a Building below the maximum level as Below limit", () => {
    expect(instanceStatus(limits, 0, 2)).toBe("below-limit");
  });

  it("flags a Building above the maximum level as Over limit", () => {
    expect(instanceStatus(limits, 0, 4)).toBe("over-limit");
  });

  it("flags a Building beyond the maximum count as Over limit", () => {
    expect(instanceStatus(limits, 2, 1)).toBe("over-limit");
  });

  it("does not flag a Building at the maximum level", () => {
    expect(instanceStatus(limits, 1, 3)).toBeNull();
  });
});

describe("unlocksAt", () => {
  it("gives the first Star Base level that allows the type", () => {
    expect(unlocksAt(LASER, 1)).toBe(3);
    expect(unlocksAt(LASER, 2)).toBe(3);
  });

  it("gives nothing once the type is unlocked", () => {
    expect(unlocksAt(LASER, 3)).toBeNull();
    expect(unlocksAt(MINE, 1)).toBeNull();
  });
});

describe("needsUpgrade", () => {
  it("is true for Missing and Below limit", () => {
    expect(needsUpgrade(["missing"])).toBe(true);
    expect(needsUpgrade(["below-limit", "over-limit"])).toBe(true);
  });

  it("is false for Maxed, Over limit alone and nothing", () => {
    expect(needsUpgrade(["maxed"])).toBe(false);
    expect(needsUpgrade(["over-limit"])).toBe(false);
    expect(needsUpgrade([])).toBe(false);
  });
});

describe("filterToUpgrade", () => {
  const catalog: Catalog = {
    version: 1,
    starBase: [],
    units: [],
    buildings: [MINE, type("bank", [[1, 1]]), LASER],
  };
  const groups = groupedBuildingsForColony(catalog, "main");

  it("keeps only the types with something to build or upgrade", () => {
    const result = filterToUpgrade(groups, 1, { mine: [3, 3], bank: [] });
    expect(result.flatMap((group) => group.types.map((t) => t.id))).toEqual(["bank"]);
  });

  it("drops the categories left empty", () => {
    expect(filterToUpgrade(groups, 1, { mine: [3, 3], bank: [1] })).toEqual([]);
  });
});
