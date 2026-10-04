import { describe, expect, it } from "vitest";
import type { BuildingType, Catalog, Category } from "./catalog";
import {
  nextSteps,
  parseDuration,
  readDuration,
  STAR_BASE_ID,
  withBanksAndSilosFirst,
  withoutWallUpgrades,
  type NextStep,
} from "./nextSteps";

function type(
  id: string,
  category: Category,
  limits: [number, number][],
  times: (string | null)[],
  mainOnly = false,
): BuildingType {
  return {
    id,
    name: id,
    category,
    mainOnly,
    unlocks: limits.map(([maxCount, maxLevel], index) => ({
      starBase: index + 1,
      maxCount,
      maxLevel,
    })),
    levels: times.map((time, index) => ({ level: index + 1, time })),
  };
}

const CATALOG: Catalog = {
  version: 1,
  starBase: [],
  units: [],
  buildings: [
    type(
      "cannon",
      "Tower",
      [
        [1, 3],
        [1, 3],
      ],
      ["1h", "2h", "3h"],
    ),
    type(
      "mine",
      "Resource",
      [
        [2, 3],
        [2, 3],
      ],
      ["10m", "20m", "30m"],
    ),
    type(
      "barracks",
      "Military",
      [
        [1, 2],
        [1, 2],
      ],
      ["5m", null],
    ),
    type(
      "laser",
      "Tower",
      [
        [0, 0],
        [1, 3],
      ],
      ["1m", "2m", "3m"],
    ),
    type(
      "observatory",
      "Resource",
      [
        [1, 2],
        [1, 2],
      ],
      ["1d", "2d"],
      true,
    ),
  ],
};

function labels(steps: NextStep[]) {
  return steps.map((step) => `${step.kind}:${step.typeId}:${step.instance}:${step.targetLevel}`);
}

describe("parseDuration", () => {
  it("adds up every unit of a compact duration in seconds", () => {
    expect(parseDuration("1w 2d 3h 4m 5s")).toBe(604800 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5);
  });

  it("parses a single unit", () => {
    expect(parseDuration("10m")).toBe(600);
  });

  it("returns null for an unknown time", () => {
    expect(parseDuration(null)).toBeNull();
  });
});

describe("readDuration", () => {
  it("reads a duration typed by the player, spaces and case aside", () => {
    expect(readDuration(" 1H 30 m ")).toBe(5400);
    expect(readDuration("2d")).toBe(172800);
  });

  it("accepts a zero duration", () => {
    expect(readDuration("0s")).toBe(0);
  });

  it.each(["", "soon", "30", "1h soon", "m30"])("rejects %j", (text) => {
    expect(readDuration(text)).toBeNull();
  });
});

describe("nextSteps", () => {
  it("yields one build step at level 1 per missing instance", () => {
    const steps = nextSteps(CATALOG, "colony-1", 1, { mine: [3] }, "fastest");

    expect(labels(steps.filter((step) => step.typeId === "mine"))).toEqual(["build:mine:2:1"]);
  });

  it("yields one build step per instance when a whole type is missing", () => {
    const steps = nextSteps(CATALOG, "colony-1", 1, {}, "fastest");

    expect(labels(steps.filter((step) => step.typeId === "mine"))).toEqual([
      "build:mine:1:1",
      "build:mine:2:1",
    ]);
  });

  it("yields an upgrade step to the next level for each Building Below limit", () => {
    const steps = nextSteps(CATALOG, "colony-1", 1, { mine: [3, 1], cannon: [3] }, "fastest");

    expect(labels(steps)).toContain("upgrade:mine:2:2");
    expect(labels(steps.filter((step) => step.typeId === "cannon"))).toEqual([]);
  });

  it("takes the time of the target level from the catalog", () => {
    const [step] = nextSteps(CATALOG, "colony-1", 1, { mine: [3, 1] }, "fastest").filter(
      (candidate) => candidate.typeId === "mine",
    );

    expect(step).toMatchObject({ time: "20m", seconds: 1200 });
  });

  it("never recommends a type that the Star Base level has not unlocked", () => {
    const steps = nextSteps(CATALOG, "colony-1", 1, {}, "fastest");

    expect(steps.map((step) => step.typeId)).not.toContain("laser");
    expect(nextSteps(CATALOG, "colony-1", 2, {}, "fastest").map((step) => step.typeId)).toContain(
      "laser",
    );
  });

  it("never recommends a main planet type on another Colony", () => {
    expect(nextSteps(CATALOG, "colony-1", 1, {}, "fastest").map((s) => s.typeId)).not.toContain(
      "observatory",
    );
    expect(nextSteps(CATALOG, "main", 1, {}, "fastest").map((s) => s.typeId)).toContain(
      "observatory",
    );
  });

  it("never recommends anything for Over limit Buildings", () => {
    const steps = nextSteps(CATALOG, "colony-1", 1, { mine: [3, 3, 1], cannon: [5] }, "fastest");

    expect(steps.filter((step) => step.typeId === "mine")).toEqual([]);
    expect(steps.filter((step) => step.typeId === "cannon")).toEqual([]);
  });

  it("puts every build step before the upgrade steps", () => {
    const steps = nextSteps(CATALOG, "colony-1", 1, { mine: [1, 1] }, "fastest");

    expect(labels(steps)).toEqual([
      "build:barracks:1:1",
      "build:cannon:1:1",
      "upgrade:mine:1:2",
      "upgrade:mine:2:2",
    ]);
    expect(labels(nextSteps(CATALOG, "colony-1", 1, { mine: [1, 1] }, "longest"))).toEqual([
      "build:cannon:1:1",
      "build:barracks:1:1",
      "upgrade:mine:1:2",
      "upgrade:mine:2:2",
    ]);
  });

  it("orders by longest across categories", () => {
    const steps = nextSteps(CATALOG, "colony-1", 2, {}, "longest");

    expect(labels(steps)).toEqual([
      "build:cannon:1:1",
      "build:mine:1:1",
      "build:mine:2:1",
      "build:barracks:1:1",
      "build:laser:1:1",
    ]);
  });

  it("keeps only the steps of one category", () => {
    const steps = nextSteps(CATALOG, "colony-1", 2, {}, "fastest", "Tower");

    expect(labels(steps)).toEqual(["build:laser:1:1", "build:cannon:1:1"]);
  });

  it("orders by fastest across categories", () => {
    const steps = nextSteps(CATALOG, "colony-1", 2, {}, "fastest");

    expect(labels(steps)).toEqual([
      "build:laser:1:1",
      "build:barracks:1:1",
      "build:mine:1:1",
      "build:mine:2:1",
      "build:cannon:1:1",
    ]);
  });

  it("sorts a step with an unknown time last when ordering by time", () => {
    const steps = nextSteps(CATALOG, "colony-1", 1, { barracks: [1], cannon: [1] }, "fastest");
    const unknown = steps.find((step) => step.typeId === "barracks");

    expect(unknown).toMatchObject({ time: null, seconds: null });
    expect(steps[steps.length - 1]).toBe(unknown);
  });

  it("sorts a step with an unknown time last when ordering by longest", () => {
    const unknownFirst: Catalog = {
      ...CATALOG,
      buildings: [
        type("slow", "Resource", [[1, 1]], [null]),
        type("quick", "Resource", [[1, 1]], ["1m"]),
      ],
    };

    expect(labels(nextSteps(unknownFirst, "main", 1, {}, "longest"))).toEqual([
      "build:quick:1:1",
      "build:slow:1:1",
    ]);
  });

  it("keeps the catalog order between steps with the same time", () => {
    const tied: Catalog = {
      ...CATALOG,
      buildings: [type("a", "Resource", [[1, 1]], ["1m"]), type("b", "Resource", [[1, 1]], ["1m"])],
    };

    expect(labels(nextSteps(tied, "main", 1, {}, "fastest"))).toEqual([
      "build:a:1:1",
      "build:b:1:1",
    ]);
  });

  it("gives an unknown time to a level the catalog does not list", () => {
    const short: Catalog = {
      ...CATALOG,
      buildings: [type("mine", "Resource", [[1, 3]], ["1m"])],
    };

    const steps = nextSteps(short, "main", 1, { mine: [1] }, "fastest");

    expect(steps[0]).toMatchObject({ targetLevel: 2, time: null, seconds: null });
  });

  describe("Star Base", () => {
    const WITH_STAR_BASE: Catalog = {
      ...CATALOG,
      starBase: [
        { level: 1, time: null },
        { level: 2, time: "10m" },
        { level: 3, time: "4h" },
      ],
    };

    it("recommends raising the Star Base by one level with its catalog time", () => {
      const steps = nextSteps(WITH_STAR_BASE, "colony-1", 2, {}, "fastest");

      expect(steps.find((step) => step.typeId === STAR_BASE_ID)).toMatchObject({
        kind: "upgrade",
        typeName: "Star Base",
        instance: 1,
        count: 1,
        shared: false,
        targetLevel: 3,
        time: "4h",
        seconds: 4 * 3600,
      });
    });

    it("orders the Star Base step among the upgrades by its time", () => {
      const steps = nextSteps(WITH_STAR_BASE, "colony-1", 1, { mine: [1, 1] }, "fastest");

      expect(labels(steps)).toEqual([
        "build:barracks:1:1",
        "build:cannon:1:1",
        "upgrade:star-base:1:2",
        "upgrade:mine:1:2",
        "upgrade:mine:2:2",
      ]);
    });

    it("recommends nothing for the Star Base at its highest level", () => {
      const steps = nextSteps(WITH_STAR_BASE, "colony-1", 3, {}, "fastest");

      expect(steps.some((step) => step.typeId === STAR_BASE_ID)).toBe(false);
    });

    it("leaves the Star Base out of a single category", () => {
      const steps = nextSteps(WITH_STAR_BASE, "colony-1", 1, {}, "fastest", "Resource");

      expect(steps.some((step) => step.typeId === STAR_BASE_ID)).toBe(false);
    });
  });
});

describe("withoutWallUpgrades", () => {
  it("drops shared-level upgrade steps and keeps every other step", () => {
    const step = (kind: NextStep["kind"], shared: boolean): NextStep => ({
      kind,
      typeId: shared ? "walls" : "mine",
      typeName: shared ? "Walls" : "Mine",
      category: shared ? "Defense" : "Resource",
      instance: 1,
      count: 1,
      shared,
      targetLevel: 2,
      time: "1m",
      seconds: 60,
    });
    const steps = [step("upgrade", true), step("build", true), step("upgrade", false)];

    expect(withoutWallUpgrades(steps)).toEqual([steps[1], steps[2]]);
  });
});

describe("withBanksAndSilosFirst", () => {
  it("moves the Bank and Silo steps ahead of the others and keeps each group in order", () => {
    const step = (typeId: string, kind: NextStep["kind"]): NextStep => ({
      kind,
      typeId,
      typeName: typeId,
      category: "Resource",
      instance: 1,
      count: 1,
      shared: false,
      targetLevel: 2,
      time: "1m",
      seconds: 60,
    });
    const steps = [
      step("mine", "build"),
      step("silo", "build"),
      step("mine", "upgrade"),
      step("bank", "upgrade"),
      step("silo", "upgrade"),
    ];

    expect(withBanksAndSilosFirst(steps)).toEqual([
      steps[1],
      steps[3],
      steps[4],
      steps[0],
      steps[2],
    ]);
  });
});
