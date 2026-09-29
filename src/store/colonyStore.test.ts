import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalStorageColonyStore,
  createMemoryColonyStore,
  type ColonyBuildings,
  type ColonyStore,
} from "./colonyStore";

function entry(starBaseLevel: number, updatedAt: number, buildings: ColonyBuildings = {}) {
  return { starBaseLevel, buildings, updatedAt };
}

function behavesLikeAColonyStore(name: string, create: () => ColonyStore) {
  describe(name, () => {
    it("returns null for a Colony that was never set", () => {
      expect(create().get("main")).toBeNull();
    });

    it("records the Star Base level, the Buildings and the updatedAt timestamp", () => {
      const store = create();
      store.set("main", entry(4, 500, { mine: [3, 1] }));
      expect(store.get("main")).toEqual({
        starBaseLevel: 4,
        buildings: { mine: [3, 1] },
        updatedAt: 500,
      });
    });

    it("records the Constructions of a Colony", () => {
      const store = create();
      const constructions = [
        {
          kind: "upgrade" as const,
          typeId: "mine",
          instance: 2,
          count: 1,
          targetLevel: 3,
          finishAt: 900,
        },
      ];
      store.set("main", { ...entry(4, 500, { mine: [3, 2] }), constructions });
      expect(store.get("main")?.constructions).toEqual(constructions);
    });

    it("records the Worker count of a Colony", () => {
      const store = create();
      store.set("main", { ...entry(4, 500), workers: 3 });
      expect(store.get("main")?.workers).toBe(3);
    });

    it("records the Unit levels, the Research and the Unlock of a Colony", () => {
      const store = create();
      const laboratory = {
        units: { marine: 3, looter: 1 },
        research: { unitId: "marine", targetLevel: 4, finishAt: 900 },
        unlock: { unitId: "bazooka", targetLevel: 1, finishAt: 800 },
      };
      store.set("main", { ...entry(4, 500), ...laboratory });
      expect(store.get("main")).toEqual({ ...entry(4, 500), ...laboratory });
    });

    it("keeps each Colony separate", () => {
      const store = create();
      store.set("main", entry(4, 500));
      store.set("colony-1", entry(2, 600));
      expect(store.get("main")?.starBaseLevel).toBe(4);
      expect(store.get("colony-1")?.starBaseLevel).toBe(2);
    });

    it("notifies subscribers of that Colony when it changes", () => {
      const store = create();
      const onMain = vi.fn();
      const onOther = vi.fn();
      store.subscribe("main", onMain);
      store.subscribe("colony-1", onOther);

      store.set("main", entry(3, 500));

      expect(onMain).toHaveBeenCalledTimes(1);
      expect(onOther).not.toHaveBeenCalled();
    });

    it("stops notifying after unsubscribe", () => {
      const store = create();
      const onChange = vi.fn();
      const unsubscribe = store.subscribe("main", onChange);
      unsubscribe();

      store.set("main", entry(3, 500));

      expect(onChange).not.toHaveBeenCalled();
    });
  });
}

behavesLikeAColonyStore("createMemoryColonyStore", () => createMemoryColonyStore());

describe("createLocalStorageColonyStore", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  behavesLikeAColonyStore("as a Colony store", () => createLocalStorageColonyStore());

  it("keeps a Colony across a new store instance", () => {
    createLocalStorageColonyStore().set("main", entry(5, 700, { mine: [2] }));
    expect(createLocalStorageColonyStore().get("main")).toEqual(entry(5, 700, { mine: [2] }));
  });

  it("returns the same object until the stored value changes", () => {
    const store = createLocalStorageColonyStore();
    store.set("main", entry(2, 100));
    const first = store.get("main");
    expect(store.get("main")).toBe(first);

    store.set("main", entry(3, 200));
    expect(store.get("main")).not.toBe(first);
  });

  it("reads a Colony saved before Buildings were tracked as having none", () => {
    localStorage.setItem("gl-colony-main", '{"starBaseLevel":2,"updatedAt":9}');
    expect(createLocalStorageColonyStore().get("main")).toEqual(entry(2, 9));
  });

  it("reads the levels of a Building type in descending order", () => {
    localStorage.setItem(
      "gl-colony-main",
      '{"starBaseLevel":2,"updatedAt":9,"buildings":{"mine":[1,3,2]}}',
    );
    expect(createLocalStorageColonyStore().get("main")).toEqual(entry(2, 9, { mine: [3, 2, 1] }));
  });

  it.each([
    "abc",
    "null",
    "{}",
    '{"starBaseLevel":"x","updatedAt":1}',
    '{"starBaseLevel":2}',
    '{"starBaseLevel":2,"updatedAt":1,"buildings":[]}',
    '{"starBaseLevel":2,"updatedAt":1,"buildings":{"mine":"x"}}',
    '{"starBaseLevel":2,"updatedAt":1,"buildings":{"mine":["x"]}}',
    '{"starBaseLevel":2,"updatedAt":1,"constructions":{}}',
    '{"starBaseLevel":2,"updatedAt":1,"workers":"3"}',
    '{"starBaseLevel":2,"updatedAt":1,"workers":0}',
    '{"starBaseLevel":2,"updatedAt":1,"workers":2.5}',
    '{"starBaseLevel":2,"updatedAt":1,"constructions":[{"kind":"repair","typeId":"mine","instance":1,"count":1,"targetLevel":2,"finishAt":5}]}',
    '{"starBaseLevel":2,"updatedAt":1,"constructions":[{"kind":"build","typeId":3,"instance":1,"count":1,"targetLevel":2,"finishAt":5}]}',
    '{"starBaseLevel":2,"updatedAt":1,"constructions":[{"kind":"build","typeId":"mine","instance":1,"count":1,"targetLevel":2}]}',
    '{"starBaseLevel":2,"updatedAt":1,"units":[]}',
    '{"starBaseLevel":2,"updatedAt":1,"units":{"marine":"3"}}',
    '{"starBaseLevel":2,"updatedAt":1,"units":{"marine":0}}',
    '{"starBaseLevel":2,"updatedAt":1,"units":{"marine":2.5}}',
    '{"starBaseLevel":2,"updatedAt":1,"research":"marine 2 5"}',
    '{"starBaseLevel":2,"updatedAt":1,"research":{"unitId":"marine","targetLevel":2}}',
    '{"starBaseLevel":2,"updatedAt":1,"unlock":{"unitId":3,"targetLevel":1,"finishAt":5}}',
  ])("treats the corrupted stored value %s as never set", (value) => {
    localStorage.setItem("gl-colony-main", value);
    expect(createLocalStorageColonyStore().get("main")).toBeNull();
  });

  it("notifies when another tab writes the same Colony", () => {
    const store = createLocalStorageColonyStore();
    const onChange = vi.fn();
    store.subscribe("main", onChange);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "gl-colony-main", storageArea: localStorage }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
