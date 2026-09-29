import { describe, expect, it } from "vitest";
import { groupedBuildingsForColony, limitsAt, withCount, withLevel } from "./buildings";
import type { BuildingType, Catalog } from "./catalog";

function type(id: string, category: BuildingType["category"], mainOnly = false): BuildingType {
  return {
    id,
    name: id,
    category,
    mainOnly,
    unlocks: [{ starBase: 1, maxLevel: 3, maxCount: 2 }],
    levels: [],
  };
}

const CATALOG: Catalog = {
  version: 1,
  starBase: [],
  units: [],
  buildings: [
    type("tower", "Tower"),
    type("observatory", "Resource", true),
    type("mine", "Resource"),
  ],
};

describe("groupedBuildingsForColony", () => {
  it("orders categories as the catalog defines them and keeps catalog order inside", () => {
    expect(
      groupedBuildingsForColony(CATALOG, "main").map((group) => [
        group.category,
        group.types.map((t) => t.id),
      ]),
    ).toEqual([
      ["Resource", ["observatory", "mine"]],
      ["Tower", ["tower"]],
    ]);
  });

  it("hides the types that exist only on the main planet in the other Colonies", () => {
    const ids = groupedBuildingsForColony(CATALOG, "colony-3").flatMap((group) =>
      group.types.map((t) => t.id),
    );
    expect(ids).toEqual(["mine", "tower"]);
  });
});

describe("limitsAt", () => {
  it("returns the limits of the Star Base level", () => {
    expect(limitsAt(type("mine", "Resource"), 1)).toMatchObject({ maxLevel: 3, maxCount: 2 });
  });

  it("allows nothing at a Star Base level the type does not list", () => {
    expect(limitsAt(type("mine", "Resource"), 9)).toMatchObject({ maxLevel: 0, maxCount: 0 });
  });
});

describe("withCount", () => {
  it("removes the lowest levels first", () => {
    expect(withCount([5, 3, 1], 2)).toEqual([5, 3]);
  });

  it("adds instances at level 1", () => {
    expect(withCount([5], 3)).toEqual([5, 1, 1]);
  });

  it("does not change the list it is given", () => {
    const levels = [5, 3];
    withCount(levels, 1);
    expect(levels).toEqual([5, 3]);
  });
});

describe("withLevel", () => {
  it("sorts the levels in descending order after the change", () => {
    expect(withLevel([3, 2], 1, 5)).toEqual([5, 3]);
  });
});
