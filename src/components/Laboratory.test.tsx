import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createMemoryAuthService } from "../auth/auth";
import type { BuildingType, Catalog, Category, UnitCategory, UnitType } from "../planner/catalog";
import { createMemoryColonyStore, type ColonyEntry, type ColonyStore } from "../store/colonyStore";
import { createMemoryDropStore } from "../store/dropStore";

const NOW = new Date("2026-01-01T12:00:00").getTime();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function building(id: string, name: string, category: Category, limits: [number, number][]) {
  const type: BuildingType = {
    id,
    name,
    category,
    mainOnly: false,
    unlocks: limits.map(([maxCount, maxLevel], index) => ({
      starBase: index + 1,
      maxCount,
      maxLevel,
    })),
    levels: [1, 2, 3, 4, 5, 6].map((level) => ({ level, time: "1h" })),
  };
  return type;
}

function unit(
  id: string,
  name: string,
  category: UnitCategory,
  buildingId: string,
  starBase: number,
  unlockTime: string | null,
  laboratories: number[],
  times: (string | null)[],
): UnitType {
  return {
    id,
    name,
    category,
    building: buildingId,
    starBase,
    startsUnlocked: id === "marine",
    unlockTime,
    levels: laboratories.map((laboratory, index) => ({
      level: index + 2,
      laboratory,
      time: times[index],
    })),
  };
}

const CATALOG: Catalog = {
  version: 1,
  starBase: [1, 2, 3].map((level) => ({ level, time: "1d" })),
  buildings: [
    building("training-camp", "Training Camp", "Military", [
      [1, 1],
      [1, 2],
      [1, 3],
    ]),
    building("factory", "Factory", "Military", [
      [0, 0],
      [1, 1],
      [1, 2],
    ]),
    building("starport", "Starport", "Military", [
      [0, 0],
      [0, 0],
      [1, 1],
    ]),
    building("laboratory", "Laboratory", "Military", [
      [1, 2],
      [1, 4],
      [1, 6],
    ]),
  ],
  units: [
    unit(
      "marine",
      "Marine",
      "Infantry",
      "training-camp",
      1,
      null,
      [1, 1, 2, 2, 3],
      ["2h", "3h", "5h", "8h", "12h"],
    ),
    unit(
      "looter",
      "Looter",
      "Infantry",
      "training-camp",
      1,
      "30m",
      [1, 2, 2, 3, 3],
      ["1h", "6h", null, "16h", "1d"],
    ),
    unit(
      "beetle-tank",
      "Beetle Tank",
      "Vehicle",
      "factory",
      2,
      null,
      [1, 2, 2, 2, 3],
      ["4h", "12h", "18h", "1d", "2d"],
    ),
    unit(
      "wasp",
      "Wasp",
      "Aircraft",
      "starport",
      3,
      "1d",
      [3, 3, 3, 4, 5],
      ["12h", "16h", "1d", "2d", "3d"],
    ),
  ],
};

let time = NOW;

beforeEach(() => {
  time = NOW;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

function seed(entry: Partial<ColonyEntry>): ColonyStore {
  const store = createMemoryColonyStore();
  store.set("main", {
    starBaseLevel: 2,
    buildings: { "training-camp": [1], laboratory: [1] },
    updatedAt: 1,
    ...entry,
  });
  return store;
}

function renderApp(store: ColonyStore = seed({})) {
  render(
    <App
      store={createMemoryDropStore()}
      auth={createMemoryAuthService()}
      now={() => time}
      colonyStore={store}
      catalog={CATALOG}
    />,
  );
  return store;
}

function passTime(ms: number) {
  time += ms;
  act(() => {
    vi.advanceTimersByTime(1000);
  });
}

async function click(name: string, scope = screen.getByRole("main")) {
  await userEvent.click(within(scope).getByRole("button", { name }));
}

async function openLaboratoryTab() {
  await userEvent.click(screen.getByRole("tab", { name: "Laboratory" }));
}

function strip() {
  return screen.getByRole("region", { name: "Laboratory" });
}

function slot(name: "Research" | "Unlock") {
  return within(strip()).getByRole("group", { name });
}

function row(name: string) {
  return screen.getByRole("row", { name });
}

function statusOf(name: string) {
  return within(row(name)).getByRole("status").textContent;
}

function levelInput(name: string) {
  return within(row(name)).getByRole("spinbutton", { name: `${name} level` });
}

function options(name: "Research" | "Unlock") {
  return within(within(slot(name)).getByRole("combobox", { name: `Next ${name}` }))
    .getAllByRole("option")
    .map((option) => option.textContent);
}

describe("Laboratory", () => {
  describe("icons", () => {
    it("shows the icon of the Unit type next to its name in the table", async () => {
      renderApp();
      await openLaboratoryTab();

      const icon = row("Marine").querySelector("img");
      expect(icon).toHaveAttribute("alt", "");
      expect(icon?.getAttribute("src")).toContain("marine");
      expect(within(row("Marine")).getByText("Marine")).toBeInTheDocument();
    });

    it("shows the icon of the Unit type of the next Research and of a running one", async () => {
      renderApp();

      expect(slot("Research").querySelector("img")?.getAttribute("src")).toContain("marine");
      await click("Start Research Marine to level 2", slot("Research"));
      expect(slot("Research").querySelector("img")?.getAttribute("src")).toContain("marine");
    });
  });

  describe("Buildings / Laboratory tabs", () => {
    it("shows the Buildings list by default and the Laboratory table on demand", async () => {
      renderApp();

      expect(screen.getByRole("tab", { name: "Buildings" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("group", { name: "Training Camp" })).toBeInTheDocument();
      expect(screen.queryByRole("table")).toBeNull();

      await openLaboratoryTab();

      expect(screen.queryByRole("group", { name: "Training Camp" })).toBeNull();
      expect(screen.getAllByRole("table").map((table) => table.getAttribute("aria-label"))).toEqual(
        ["Infantry", "Vehicle", "Aircraft"],
      );
      expect(
        within(screen.getByRole("table", { name: "Infantry" }))
          .getAllByRole("row")
          .map((item) => item.getAttribute("aria-label")),
      ).toEqual(["Marine", "Looter"]);

      await userEvent.click(screen.getByRole("tab", { name: "Buildings" }));

      expect(screen.getByRole("group", { name: "Training Camp" })).toBeInTheDocument();
    });

    it("keeps the Laboratory strip and the Next steps visible on both tabs", async () => {
      renderApp();
      expect(strip()).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Next steps" })).toBeInTheDocument();

      await openLaboratoryTab();

      expect(strip()).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Next steps" })).toBeInTheDocument();
    });
  });

  describe("Unit types", () => {
    it("shows each Unit type's level against its cap and its status", async () => {
      renderApp(seed({ units: { looter: 3 } }));
      await openLaboratoryTab();

      expect(levelInput("Marine")).toHaveValue(1);
      expect(row("Marine")).toHaveTextContent("/ 3");
      expect(statusOf("Marine")).toBe("To research");
      expect(levelInput("Looter")).toHaveValue(3);
      expect(row("Looter")).toHaveTextContent("/ 2");
      expect(statusOf("Looter")).toBe("Over limit");
      expect(statusOf("Beetle Tank")).toBe("Needs a Factory");
      expect(statusOf("Wasp")).toBe("Unlocks at Star Base 3");
    });

    it("shows a Unit type not yet unlocked as To unlock at level 0", async () => {
      renderApp();
      await openLaboratoryTab();

      expect(levelInput("Looter")).toHaveValue(0);
      expect(statusOf("Looter")).toBe("To unlock");
    });

    it("flags a Unit type at its cap Maxed", async () => {
      renderApp(
        seed({ buildings: { "training-camp": [1], laboratory: [2] }, units: { marine: 5 } }),
      );
      await openLaboratoryTab();

      expect(row("Marine")).toHaveTextContent("/ 5");
      expect(statusOf("Marine")).toBe("Maxed");
    });

    it("greys a locked Unit type without a level to edit", async () => {
      renderApp();
      await openLaboratoryTab();

      expect(row("Beetle Tank")).toHaveClass("opacity-45");
      expect(within(row("Beetle Tank")).queryByRole("spinbutton")).toBeNull();
      expect(within(row("Beetle Tank")).queryByRole("button")).toBeNull();
    });

    it("puts the Marine at level 1 as soon as a Training Camp exists", async () => {
      const store = renderApp(seed({ buildings: { laboratory: [1] } }));
      await openLaboratoryTab();
      expect(statusOf("Marine")).toBe("Needs a Training Camp");

      await userEvent.click(screen.getByRole("tab", { name: "Buildings" }));
      await click("Increase Training Camp owned");
      await openLaboratoryTab();

      expect(levelInput("Marine")).toHaveValue(1);
      expect(statusOf("Marine")).toBe("To research");
      expect(store.get("main")?.units).toBeUndefined();
    });

    it("edits the Unit level with the buttons and by typing, capped by the Laboratory", async () => {
      const store = renderApp();
      await openLaboratoryTab();

      await click("Increase Marine level", row("Marine"));
      expect(store.get("main")?.units).toEqual({ marine: 2 });
      expect(store.get("main")?.updatedAt).toBe(NOW);

      await userEvent.clear(levelInput("Marine"));
      await userEvent.type(levelInput("Marine"), "4{Enter}");
      expect(levelInput("Marine")).toHaveValue(2);

      await userEvent.clear(levelInput("Marine"));
      await userEvent.type(levelInput("Marine"), "3{Enter}");
      expect(store.get("main")?.units).toEqual({ marine: 3 });
      expect(
        within(row("Marine")).getByRole("button", { name: "Increase Marine level" }),
      ).toBeDisabled();
    });

    it("unlocks a Unit type by hand and takes it back to not unlocked at 0", async () => {
      const store = renderApp();
      await openLaboratoryTab();

      await click("Increase Looter level", row("Looter"));
      expect(store.get("main")?.units).toEqual({ looter: 1 });
      expect(statusOf("Looter")).toBe("To research");

      await click("Decrease Looter level", row("Looter"));
      expect(store.get("main")?.units).toBeUndefined();
      expect(statusOf("Looter")).toBe("To unlock");
    });

    it("keeps the Marine at level 1 or more", async () => {
      renderApp();
      await openLaboratoryTab();

      expect(
        within(row("Marine")).getByRole("button", { name: "Decrease Marine level" }),
      ).toBeDisabled();
    });

    it("keeps Unit levels and flags them Over limit when the Laboratory is lowered", async () => {
      const store = renderApp(
        seed({ buildings: { "training-camp": [1], laboratory: [2] }, units: { marine: 5 } }),
      );

      await click("Decrease Laboratory 1 level");
      await openLaboratoryTab();

      expect(levelInput("Marine")).toHaveValue(5);
      expect(row("Marine")).toHaveTextContent("/ 3");
      expect(statusOf("Marine")).toBe("Over limit");
      expect(store.get("main")?.units).toEqual({ marine: 5 });
    });
  });

  describe("Laboratory strip", () => {
    it("offers the Researches and the Unlocks with their time, fastest first", () => {
      renderApp(seed({ units: { looter: 1 } }));

      expect(options("Research")).toEqual([
        "Research Looter to level 2 · 1h",
        "Research Marine to level 2 · 2h",
      ]);
      expect(within(slot("Unlock")).getByText("Nothing to unlock")).toBeInTheDocument();
    });

    it("sorts a step of unknown time last", () => {
      renderApp(
        seed({ buildings: { "training-camp": [1], laboratory: [2] }, units: { looter: 3 } }),
      );

      expect(options("Research")).toEqual([
        "Research Marine to level 2 · 2h",
        "Research Looter to level 4 · time unknown",
      ]);
    });

    it("never offers a locked Unit type", () => {
      renderApp(seed({ units: { "beetle-tank": 1 } }));

      expect(options("Research").some((option) => option?.includes("Beetle Tank"))).toBe(false);
      expect(options("Unlock")).toEqual(["Unlock Looter · 30m"]);
    });

    it("starts the chosen Research with the catalog time and counts it down", async () => {
      const store = renderApp();

      await userEvent.selectOptions(
        within(slot("Research")).getByRole("combobox", { name: "Next Research" }),
        "marine",
      );
      await click("Start Research Marine to level 2", slot("Research"));

      expect(slot("Research")).toHaveTextContent("Research Marine to level 2");
      expect(slot("Research")).toHaveTextContent("02:00:00");
      expect(store.get("main")?.research).toEqual({
        unitId: "marine",
        targetLevel: 2,
        finishAt: NOW + 2 * HOUR,
      });

      passTime(30 * MINUTE);

      expect(slot("Research")).toHaveTextContent("01:30:00");
    });

    it("asks for a duration when the time is unknown", async () => {
      const store = renderApp(
        seed({ buildings: { "training-camp": [1], factory: [1], laboratory: [1] } }),
      );

      await userEvent.selectOptions(
        within(slot("Unlock")).getByRole("combobox", { name: "Next Unlock" }),
        "beetle-tank",
      );
      await click("Start Unlock Beetle Tank", slot("Unlock"));
      await userEvent.type(
        within(slot("Unlock")).getByRole("textbox", { name: "Duration of Unlock Beetle Tank" }),
        "1h 30m",
      );
      await click("Confirm Start Unlock Beetle Tank", slot("Unlock"));

      expect(store.get("main")?.unlock).toEqual({
        unitId: "beetle-tank",
        targetLevel: 1,
        finishAt: NOW + 90 * MINUTE,
      });
    });

    it("runs one Research and one Unlock in parallel, without a Worker", async () => {
      renderApp();

      await click("Start Research Marine to level 2", slot("Research"));
      await click("Start Unlock Looter", slot("Unlock"));

      expect(slot("Research")).toHaveTextContent("Research Marine to level 2");
      expect(slot("Unlock")).toHaveTextContent("Unlock Looter");
      expect(within(strip()).queryByRole("combobox")).toBeNull();
      expect(screen.getByRole("status", { name: "Workers status" })).toBeEmptyDOMElement();
      expect(
        within(screen.getByRole("region", { name: "Next steps" })).getByRole("button", {
          name: "Start Upgrade Training Camp to level 2",
        }),
      ).toBeEnabled();
    });

    it("says the Colony has no Laboratory and offers no Research", () => {
      renderApp(seed({ buildings: { "training-camp": [1] } }));

      expect(strip()).toHaveTextContent("No Laboratory on this Colony");
      expect(within(slot("Research")).getByText("No Laboratory")).toBeInTheDocument();
      expect(
        within(slot("Unlock")).getByRole("button", { name: "Start Unlock Looter" }),
      ).toBeEnabled();
    });

    it("disables Research during a Laboratory Construction, not Unlock", async () => {
      renderApp(
        seed({
          constructions: [
            {
              kind: "upgrade",
              typeId: "laboratory",
              instance: 1,
              count: 1,
              targetLevel: 2,
              finishAt: NOW + HOUR,
            },
          ],
        }),
      );

      expect(
        within(slot("Research")).getByRole("button", { name: "Start Research Marine to level 2" }),
      ).toBeDisabled();
      expect(slot("Research")).toHaveTextContent("Laboratory is being upgraded");
      expect(
        within(slot("Unlock")).getByRole("button", { name: "Start Unlock Looter" }),
      ).toBeEnabled();

      passTime(HOUR);

      expect(
        within(slot("Research")).getByRole("button", { name: "Start Research Marine to level 2" }),
      ).toBeEnabled();
    });

    it("shows a job Finished once its Finish date has passed and keeps its slot", async () => {
      renderApp();
      await click("Start Unlock Looter", slot("Unlock"));

      passTime(30 * MINUTE);

      expect(slot("Unlock")).toHaveTextContent("Finished");
      expect(within(slot("Unlock")).queryByRole("combobox")).toBeNull();
    });

    it("applies an Unlock on Done, setting the Unit level to 1", async () => {
      const store = renderApp();
      await click("Start Unlock Looter", slot("Unlock"));

      await click("Done Unlock Looter", slot("Unlock"));

      expect(store.get("main")?.units).toEqual({ looter: 1 });
      expect(store.get("main")?.unlock).toBeUndefined();
      expect(options("Research")).toContain("Research Looter to level 2 · 1h");
    });

    it("applies a Research on Done, keeping a higher level set by hand", async () => {
      const store = renderApp();
      await click("Start Research Marine to level 2", slot("Research"));
      await openLaboratoryTab();
      await userEvent.clear(levelInput("Marine"));
      await userEvent.type(levelInput("Marine"), "3{Enter}");

      await click("Done Research Marine to level 2", slot("Research"));

      expect(store.get("main")?.units).toEqual({ marine: 3 });
      expect(store.get("main")?.research).toBeUndefined();
    });

    it("keeps a job running when its unlocking Building is removed or the Laboratory lowered", async () => {
      const store = renderApp(
        seed({ buildings: { "training-camp": [1], laboratory: [2] }, units: { marine: 3 } }),
      );
      await click("Start Research Marine to level 4", slot("Research"));
      await click("Start Unlock Looter", slot("Unlock"));

      await click("Decrease Laboratory 1 level");
      await click("Decrease Training Camp owned");

      expect(slot("Research")).toHaveTextContent("Research Marine to level 4");
      expect(slot("Unlock")).toHaveTextContent("Unlock Looter");

      await click("Done Research Marine to level 4", slot("Research"));
      await click("Done Unlock Looter", slot("Unlock"));

      expect(store.get("main")?.units).toEqual({ marine: 4, looter: 1 });
    });

    it("asks for a confirmation before cancelling and leaves the Unit level alone", async () => {
      const store = renderApp();
      await click("Start Research Marine to level 2", slot("Research"));

      await click("Cancel Research Marine to level 2", slot("Research"));
      expect(slot("Research")).toHaveTextContent("Cancel this Research?");
      await click("Keep Research Marine to level 2", slot("Research"));
      expect(store.get("main")?.research).toBeDefined();

      await click("Cancel Research Marine to level 2", slot("Research"));
      await click("Confirm cancel Research Marine to level 2", slot("Research"));

      expect(store.get("main")?.research).toBeUndefined();
      expect(store.get("main")?.units).toBeUndefined();
      expect(options("Research")).toContain("Research Marine to level 2 · 2h");
    });

    it("rewrites the remaining time of a job", async () => {
      const store = renderApp();
      await click("Start Research Marine to level 2", slot("Research"));
      passTime(30 * MINUTE);

      await click("Edit Research Marine to level 2", slot("Research"));
      const input = within(slot("Research")).getByRole("textbox", {
        name: "Remaining time of Research Marine to level 2",
      });
      expect(input).toHaveValue("1h 30m");
      await userEvent.clear(input);
      await userEvent.type(input, "10m");
      await click("Confirm Edit Research Marine to level 2", slot("Research"));

      expect(slot("Research")).toHaveTextContent("00:10:00");
      expect(store.get("main")?.research?.finishAt).toBe(NOW + 40 * MINUTE);
    });
  });

  describe("Laboratory table", () => {
    it("starts the next step of a Unit type from its row", async () => {
      const store = renderApp();
      await openLaboratoryTab();

      await click("Start Unlock Looter", row("Looter"));

      expect(store.get("main")?.unlock?.unitId).toBe("looter");
      expect(within(row("Looter")).getByText("In progress")).toBeInTheDocument();
      expect(slot("Unlock")).toHaveTextContent("Unlock Looter");
    });

    it("disables the row Start while that slot is taken", async () => {
      renderApp(seed({ units: { looter: 1 } }));
      await openLaboratoryTab();

      await click("Start Research Marine to level 2", row("Marine"));

      expect(
        within(row("Looter")).getByRole("button", { name: "Start Research Looter to level 2" }),
      ).toBeDisabled();
    });
  });

  describe("outside the Laboratory", () => {
    function progress() {
      return within(screen.getByRole("group", { name: "Main planet progress" }))
        .getByRole("progressbar")
        .getAttribute("aria-valuenow");
    }

    it("leaves the Colony progress bar unchanged", () => {
      renderApp(seed({ units: { marine: 3, looter: 2 } }));
      const withUnits = progress();
      cleanup();

      renderApp();

      expect(progress()).toBe(withUnits);
    });

    it("shows no free Worker dot for Unit steps alone", () => {
      renderApp(
        seed({
          starBaseLevel: 3,
          buildings: {
            "training-camp": [3],
            factory: [2],
            starport: [1],
            laboratory: [6],
          },
        }),
      );

      expect(options("Unlock").length).toBeGreaterThan(0);
      expect(screen.queryByRole("img", { name: "Main planet has a free Worker" })).toBeNull();
    });

    const BUSY_WORKER = {
      constructions: [
        {
          kind: "upgrade" as const,
          typeId: "training-camp",
          instance: 1,
          count: 1,
          targetLevel: 2,
          finishAt: NOW + 100 * HOUR,
        },
      ],
    };

    function idleDot() {
      return screen.queryByRole("img", { name: "Main planet has an idle Laboratory" });
    }

    it("shows the idle Laboratory dot while a slot is free with a step to start", async () => {
      renderApp(seed(BUSY_WORKER));
      expect(idleDot()).toBeInTheDocument();

      await click("Start Unlock Looter", slot("Unlock"));
      expect(idleDot()).toBeInTheDocument();

      await click("Start Research Marine to level 2", slot("Research"));
      expect(idleDot()).toBeNull();

      await click("Cancel Research Marine to level 2", slot("Research"));
      await click("Confirm cancel Research Marine to level 2", slot("Research"));
      expect(idleDot()).toBeInTheDocument();
    });

    it("counts the idle Research and Unlock slots separately in the tab title", async () => {
      document.title = "GL Upgrade Planner";
      renderApp(seed(BUSY_WORKER));
      expect(document.title).toBe("(2) GL Upgrade Planner");

      await click("Start Research Marine to level 2", slot("Research"));
      passTime(0);
      expect(document.title).toBe("(1) GL Upgrade Planner");

      await click("Start Unlock Looter", slot("Unlock"));
      passTime(0);
      expect(document.title).toBe("GL Upgrade Planner");
    });
  });

  describe("Finished Research and Unlock", () => {
    type Sent = { title: string; options?: NotificationOptions };

    function installFakeNotification() {
      const sent: Sent[] = [];
      class FakeNotification {
        static permission: NotificationPermission = "granted";
        static requestPermission = async () => "granted" as const;
        constructor(title: string, options?: NotificationOptions) {
          sent.push({ title, options });
        }
      }
      vi.stubGlobal("Notification", FakeNotification);
      return sent;
    }

    function titleCount() {
      return Number(/^\((\d+)\) /.exec(document.title)?.[1] ?? 0);
    }

    beforeEach(() => {
      document.title = "GL Upgrade Planner";
    });
    afterEach(() => vi.unstubAllGlobals());

    it("counts a Finished Research and a Finished Unlock in the tab title", async () => {
      renderApp();
      await click("Start Research Marine to level 2", slot("Research"));
      await click("Start Unlock Looter", slot("Unlock"));
      passTime(0);
      const before = titleCount();

      passTime(30 * MINUTE);
      expect(titleCount()).toBe(before + 1);

      passTime(2 * HOUR);
      expect(titleCount()).toBe(before + 2);
    });

    it("drops the title count once the job is Done or cancelled, then counts the idle Laboratory", async () => {
      renderApp();
      await click("Start Research Marine to level 2", slot("Research"));
      await click("Start Unlock Looter", slot("Unlock"));
      passTime(2 * HOUR);
      const finished = titleCount();

      await click("Done Unlock Looter", slot("Unlock"));
      passTime(0);
      expect(titleCount()).toBe(finished - 1);

      await click("Cancel Research Marine to level 2", slot("Research"));
      await click("Confirm cancel Research Marine to level 2", slot("Research"));
      passTime(0);
      expect(titleCount()).toBe(finished - 1);
    });

    it("sends one notification when a Research or an Unlock becomes Finished", async () => {
      const sent = installFakeNotification();
      renderApp();
      await click("Start Research Marine to level 2", slot("Research"));
      await click("Start Unlock Looter", slot("Unlock"));
      passTime(0);

      passTime(30 * MINUTE);
      passTime(2 * HOUR);
      passTime(0);

      expect(sent).toEqual([
        {
          title: "Unlock Looter is finished",
          options: { body: "On Main planet.", tag: "lab-main-unlock-looter-1" },
        },
        {
          title: "Research Marine to level 2 is finished",
          options: { body: "On Main planet.", tag: "lab-main-research-marine-2" },
        },
      ]);
    });

    it("sends nothing for a job already Finished at load or once it is Done", async () => {
      const sent = installFakeNotification();
      renderApp(seed({ unlock: { unitId: "looter", targetLevel: 1, finishAt: NOW - MINUTE } }));
      passTime(0);
      await click("Done Unlock Looter", slot("Unlock"));
      passTime(HOUR);

      expect(sent).toHaveLength(0);
    });
  });
});
