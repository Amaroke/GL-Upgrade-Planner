import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  createAuthStore,
  createMemoryAuthService,
  type AuthService,
  type AuthState,
} from "../auth/auth";
import {
  createLocalStorageDropStore,
  createMemoryDropStore,
  OLDEST_UPDATED_AT,
} from "../store/dropStore";
import {
  createLocalStorageColonyStore,
  createMemoryColonyStore,
  type ColonyStore,
} from "../store/colonyStore";
import { createMemorySettingsStore, type SettingsStore } from "../store/settingsStore";
import type { BuildingType, Catalog, Category } from "../planner/catalog";
import type { SyncStatus } from "../store/sendScheduler";

const NOW = new Date("2026-01-01T12:00:00").getTime();
const SIGNED_OUT_AUTH = createMemoryAuthService();
function fixtureType(
  id: string,
  name: string,
  category: Category,
  mainOnly: boolean,
  limits: [number, number][],
): BuildingType {
  return {
    id,
    name,
    category,
    mainOnly,
    unlocks: limits.map(([maxCount, maxLevel], index) => ({
      starBase: index + 1,
      maxCount,
      maxLevel,
    })),
    levels: [1, 2, 3, 4, 5, 6].map((level) => ({ level, time: null })),
  };
}

const FIXTURE_CATALOG: Catalog = {
  version: 1,
  starBase: [1, 2, 3].map((level) => ({ level, time: null })),
  buildings: [
    fixtureType("observatory", "Observatory", "Resource", true, [
      [1, 2],
      [1, 4],
      [1, 6],
    ]),
    fixtureType("mine", "Mine", "Resource", false, [
      [2, 3],
      [3, 5],
      [4, 6],
    ]),
    fixtureType("cannon", "Cannon", "Tower", false, [
      [1, 1],
      [2, 2],
      [3, 3],
    ]),
    fixtureType("laser", "Laser", "Tower", false, [
      [0, 0],
      [0, 0],
      [1, 3],
    ]),
  ],
};

function authServiceFrom(
  initial: AuthState,
): AuthService & { setState: (state: AuthState) => void } {
  const store = createAuthStore(initial);
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    signIn: async () => {},
    signOut: async () => {},
    setState: store.setState,
  };
}

function fakeSyncedStore(initialStatus: SyncStatus = "synced") {
  const base = createMemoryDropStore();
  let status = initialStatus;
  const listeners = new Set<() => void>();
  return Object.assign(base, {
    saveNow: vi.fn(),
    getNextSendAt: () => NOW + 5 * 60 * 1000,
    getSyncStatus: () => status,
    subscribeSyncStatus(onChange: () => void) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    setSyncStatus(next: SyncStatus) {
      status = next;
      listeners.forEach((onChange) => onChange());
    },
  });
}

function chip(name: string) {
  return within(screen.getByRole("group", { name: `${name} timer` }));
}

function card(name: string) {
  return within(screen.getByRole("group", { name }));
}

async function openAdvanced(name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Advanced settings for ${name}` }));
}

describe("App", () => {
  describe("layout", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "Notification",
        Object.assign(function () {}, { permission: "default", requestPermission: vi.fn() }),
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    it("does not show an app title", () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      expect(screen.queryByText("GL Upgrade Planner")).toBeNull();
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    });

    it("hides the notifications button below the sm breakpoint, keeping timers and account reachable", () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      const notifications = screen.getByRole("button", { name: "Enable notifications" });
      expect(notifications.closest(".hidden")).toHaveClass("hidden", "sm:block");
      expect(screen.getByRole("button", { name: "Start Star Battery timer" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    });

    it("does not say that timers are saved in the browser", () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      expect(document.body).not.toHaveTextContent("saved in your browser");
    });

    it("keeps the Drop timers and the Planner inside the main landmark", () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      const main = screen.getByRole("main");
      expect(within(main).getByText("Star Battery")).toBeInTheDocument();
      expect(within(main).getByText("Planner")).toBeInTheDocument();
    });
  });

  describe("Planner", () => {
    function renderPlanner(
      colonyStore: ColonyStore = createMemoryColonyStore(),
      settingsStore: SettingsStore = createMemorySettingsStore(),
    ) {
      return render(
        <App
          store={createMemoryDropStore()}
          auth={SIGNED_OUT_AUTH}
          now={() => NOW}
          colonyStore={colonyStore}
          settingsStore={settingsStore}
          catalog={FIXTURE_CATALOG}
        />,
      );
    }

    function starBaseSelect() {
      return screen.getByRole("combobox", { name: "Star Base level" });
    }

    function seed(
      colonyStore: ColonyStore,
      starBaseLevel: number,
      buildings: Record<string, number[]>,
    ) {
      colonyStore.set("main", { starBaseLevel, buildings, updatedAt: 1 });
    }

    function countInput(name: string) {
      return screen.getByRole("spinbutton", { name: `${name} owned` });
    }

    function levelsOf(name: string) {
      return within(screen.getByRole("group", { name }))
        .queryAllByRole("spinbutton", { name: /level$/ })
        .map((input) => (input as HTMLInputElement).value);
    }

    function click(name: string) {
      return userEvent.click(screen.getByRole("button", { name }));
    }

    async function typeAndCommit(input: HTMLElement, value: string) {
      await userEvent.clear(input);
      await userEvent.type(input, value);
      await userEvent.tab();
    }

    it("sits below the Drop timers on the same page, without page tabs", () => {
      renderPlanner();

      const timers = screen.getByRole("group", { name: "Star Battery timer" });
      const planner = screen.getByRole("heading", { name: "Planner" });
      expect(
        timers.compareDocumentPosition(planner) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.getAllByRole("tablist")).toHaveLength(1);
      expect(screen.getByRole("tablist")).toHaveAccessibleName("Colonies");
    });

    it("always shows the twelve fixed Colonies, the main planet selected by default", () => {
      renderPlanner();

      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(12);
      expect(tabs[0]).toHaveAttribute("aria-selected", "true");
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        "Main",
        "1st",
        "2nd",
        "3rd",
        "4th",
        "5th",
        "6th",
        "7th",
        "8th",
        "9th",
        "10th",
        "11th",
      ]);
      expect(tabs[0]).toHaveAccessibleName("Main planet");
      for (let i = 1; i <= 11; i++) expect(tabs[i]).toHaveAccessibleName(`Colony ${i}`);
    });

    it("greys every other Colony", () => {
      renderPlanner();

      const tabs = screen.getAllByRole("tab");
      expect(tabs[0]).toBeEnabled();
      for (let i = 1; i <= 11; i++) expect(tabs[i]).toBeDisabled();
    });

    describe("Observatory", () => {
      function tab(name: string) {
        return screen.getByRole("tab", { name });
      }

      it("unlocks Colonies one per Observatory level, in order", () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { observatory: [3] });
        renderPlanner(colonyStore);

        const tabs = screen.getAllByRole("tab");
        expect(tabs[0]).toBeEnabled();
        for (let i = 1; i <= 3; i++) expect(tabs[i]).toBeEnabled();
        for (let i = 4; i <= 11; i++) expect(tabs[i]).toBeDisabled();
      });

      it("unlocks a Colony as soon as the Observatory level is raised in the Planner", async () => {
        renderPlanner();
        expect(tab("Colony 1")).toBeDisabled();

        await click("Increase Observatory owned");
        expect(tab("Colony 1")).toBeEnabled();
        expect(tab("Colony 2")).toBeDisabled();

        await click("Increase Observatory 1 level");

        expect(tab("Colony 2")).toBeEnabled();
        expect(tab("Colony 3")).toBeDisabled();
      });

      it("lets the player edit an unlocked Colony", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { observatory: [1] });
        renderPlanner(colonyStore);

        await userEvent.click(tab("Colony 1"));
        await userEvent.selectOptions(starBaseSelect(), "2");

        expect(tab("Colony 1")).toHaveAttribute("aria-selected", "true");
        expect(colonyStore.get("colony-1")).toEqual({
          starBaseLevel: 2,
          buildings: {},
          updatedAt: NOW,
        });
      });

      it("relocks Colonies when the Observatory level is lowered", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 3, { observatory: [3] });
        renderPlanner(colonyStore);

        await click("Decrease Observatory 1 level");

        expect(tab("Colony 2")).toBeEnabled();
        expect(tab("Colony 3")).toBeDisabled();
      });

      it("relocks every Colony when the Observatory is removed", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 3, { observatory: [2] });
        renderPlanner(colonyStore);

        await click("Decrease Observatory owned");

        expect(tab("Colony 1")).toBeDisabled();
        expect(tab("Colony 2")).toBeDisabled();
      });

      it("keeps the data of a relocked Colony and shows it again once unlocked", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 3, { observatory: [1] });
        const colonyData = { starBaseLevel: 2, buildings: { mine: [2, 1] }, updatedAt: 7 };
        colonyStore.set("colony-1", colonyData);
        renderPlanner(colonyStore);

        await click("Decrease Observatory owned");
        expect(tab("Colony 1")).toBeDisabled();
        expect(colonyStore.get("colony-1")).toEqual(colonyData);

        await click("Increase Observatory owned");
        await click("Increase Observatory 1 level");
        await userEvent.click(tab("Colony 1"));

        expect(starBaseSelect()).toHaveValue("2");
        expect(levelsOf("Mine")).toEqual(["2", "1"]);
      });

      it("shows the main planet again when the selected Colony gets relocked", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { observatory: [2] });
        renderPlanner(colonyStore);
        await userEvent.click(tab("Colony 2"));

        act(() => seed(colonyStore, 1, { observatory: [1] }));

        expect(tab("Colony 2")).toBeDisabled();
        expect(tab("Main planet")).toHaveAttribute("aria-selected", "true");
      });
    });

    it("starts a Colony without a saved Star Base at level 1, limited to the catalog levels", () => {
      renderPlanner();

      expect(starBaseSelect()).toHaveValue("1");
      expect(
        within(starBaseSelect())
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["1", "2", "3"]);
    });

    it("saves the Star Base level with an updated-at timestamp", async () => {
      const colonyStore = createMemoryColonyStore();
      renderPlanner(colonyStore);

      await userEvent.selectOptions(starBaseSelect(), "3");

      expect(starBaseSelect()).toHaveValue("3");
      expect(colonyStore.get("main")).toEqual({ starBaseLevel: 3, buildings: {}, updatedAt: NOW });
    });

    it("keeps the Star Base level after a reload", async () => {
      const colonyStore = createMemoryColonyStore();
      const { unmount } = renderPlanner(colonyStore);
      await userEvent.selectOptions(starBaseSelect(), "2");
      unmount();

      renderPlanner(colonyStore);

      expect(starBaseSelect()).toHaveValue("2");
    });

    describe("in the browser storage", () => {
      beforeEach(() => localStorage.clear());
      afterEach(() => localStorage.clear());

      it("keeps the Star Base level after a reload", async () => {
        const { unmount } = renderPlanner(createLocalStorageColonyStore());
        await userEvent.selectOptions(starBaseSelect(), "3");
        unmount();

        renderPlanner(createLocalStorageColonyStore());

        expect(starBaseSelect()).toHaveValue("3");
      });

      it("keeps the owned Buildings and their levels after a reload", async () => {
        const { unmount } = renderPlanner(createLocalStorageColonyStore());
        await click("Increase Mine owned");
        await click("Increase Mine owned");
        await click("Increase Mine 1 level");
        unmount();

        renderPlanner(createLocalStorageColonyStore());

        expect(countInput("Mine")).toHaveValue(2);
        expect(levelsOf("Mine")).toEqual(["2", "1"]);
      });
    });

    describe("Buildings", () => {
      it("lists every Building type of the catalog grouped by category", () => {
        renderPlanner();

        const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
        expect(headings).toEqual(["Next steps", "Resource", "Tower"]);
        const names = within(screen.getByRole("tabpanel"))
          .getAllByRole("group")
          .map((group) => group.getAttribute("aria-label"));
        expect(names).toEqual(["Observatory", "Mine", "Cannon", "Laser"]);
      });

      it("shows the owned count against the maximum count of the Star Base", () => {
        renderPlanner();

        const mine = within(screen.getByRole("group", { name: "Mine" }));
        expect(countInput("Mine")).toHaveValue(0);
        expect(mine.getByText("/ 2")).toBeInTheDocument();
      });

      it("shows each level against the maximum level of the Star Base", () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [3, 1] });
        renderPlanner(colonyStore);

        const mine = within(screen.getByRole("group", { name: "Mine" }));
        expect(levelsOf("Mine")).toEqual(["3", "1"]);
        expect(mine.getByText("Levels (max 3)")).toBeInTheDocument();
      });

      it("updates every limit when the Star Base level changes", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [3] });
        renderPlanner(colonyStore);

        await userEvent.selectOptions(starBaseSelect(), "2");

        const mine = within(screen.getByRole("group", { name: "Mine" }));
        expect(mine.getByText("/ 3")).toBeInTheDocument();
        expect(mine.getByText("Levels (max 5)")).toBeInTheDocument();
        expect(colonyStore.get("main")?.buildings).toEqual({ mine: [3] });
      });

      it("adds an instance at level 1 when the count is raised with the button", async () => {
        const colonyStore = createMemoryColonyStore();
        renderPlanner(colonyStore);

        await click("Increase Mine owned");

        expect(countInput("Mine")).toHaveValue(1);
        expect(levelsOf("Mine")).toEqual(["1"]);
        expect(colonyStore.get("main")).toEqual({
          starBaseLevel: 1,
          buildings: { mine: [1] },
          updatedAt: NOW,
        });
      });

      it("removes the lowest-level instance when the count is lowered with the button", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 3, { mine: [5, 3, 1] });
        renderPlanner(colonyStore);

        await click("Decrease Mine owned");

        expect(countInput("Mine")).toHaveValue(2);
        expect(levelsOf("Mine")).toEqual(["5", "3"]);
      });

      it("sets the count by typing it, adding instances at level 1", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [3] });
        renderPlanner(colonyStore);

        await typeAndCommit(countInput("Mine"), "2");

        expect(levelsOf("Mine")).toEqual(["3", "1"]);
      });

      it("commits a typed value on Enter", async () => {
        renderPlanner();

        await userEvent.type(countInput("Mine"), "{Backspace}2{Enter}");

        expect(levelsOf("Mine")).toEqual(["1", "1"]);
      });

      it("removes the lowest-level instances when a lower count is typed", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 3, { mine: [5, 3, 1] });
        renderPlanner(colonyStore);

        await typeAndCommit(countInput("Mine"), "1");

        expect(levelsOf("Mine")).toEqual(["5"]);
      });

      it("refuses a count above the maximum of the Star Base", async () => {
        const colonyStore = createMemoryColonyStore();
        renderPlanner(colonyStore);

        await typeAndCommit(countInput("Mine"), "3");

        expect(countInput("Mine")).toHaveValue(0);
        expect(colonyStore.get("main")).toBeNull();
      });

      it("refuses a count that is not a whole number", async () => {
        renderPlanner();

        await typeAndCommit(countInput("Mine"), "1.5");

        expect(countInput("Mine")).toHaveValue(0);
      });

      it("stops the count buttons at the limits", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [1, 1] });
        renderPlanner(colonyStore);

        expect(screen.getByRole("button", { name: "Increase Mine owned" })).toBeDisabled();
        await click("Decrease Mine owned");
        await click("Decrease Mine owned");
        expect(screen.getByRole("button", { name: "Decrease Mine owned" })).toBeDisabled();
      });

      it("raises and lowers the level of one instance with the buttons", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [2, 1] });
        renderPlanner(colonyStore);

        await click("Increase Mine 1 level");
        expect(levelsOf("Mine")).toEqual(["3", "1"]);
        await click("Decrease Mine 1 level");
        expect(levelsOf("Mine")).toEqual(["2", "1"]);
      });

      it("stops the level buttons at level 1 and at the maximum level", () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [3, 1] });
        renderPlanner(colonyStore);

        expect(screen.getByRole("button", { name: "Increase Mine 1 level" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Decrease Mine 2 level" })).toBeDisabled();
      });

      it("sets the level of an instance by typing it", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 3, { mine: [4] });
        renderPlanner(colonyStore);

        await typeAndCommit(screen.getByRole("spinbutton", { name: "Mine 1 level" }), "6");

        expect(levelsOf("Mine")).toEqual(["6"]);
        expect(colonyStore.get("main")?.buildings).toEqual({ mine: [6] });
      });

      it("refuses a level above the maximum of the Star Base or below 1", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [2] });
        renderPlanner(colonyStore);
        const level = screen.getByRole("spinbutton", { name: "Mine 1 level" });

        await typeAndCommit(level, "4");
        expect(levelsOf("Mine")).toEqual(["2"]);

        await typeAndCommit(level, "0");
        expect(levelsOf("Mine")).toEqual(["2"]);
        expect(colonyStore.get("main")?.buildings).toEqual({ mine: [2] });
      });

      it("keeps the levels in descending order, sorting only when the edit is committed", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 2, { mine: [3, 2] });
        renderPlanner(colonyStore);
        const second = screen.getByRole("spinbutton", { name: "Mine 2 level" });

        await userEvent.clear(second);
        await userEvent.type(second, "5");
        expect(levelsOf("Mine")).toEqual(["3", "5"]);

        await userEvent.tab();
        expect(levelsOf("Mine")).toEqual(["5", "3"]);
        expect(colonyStore.get("main")?.buildings).toEqual({ mine: [5, 3] });
      });

      it("sorts the levels when a button raises one above another", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [2, 2] });
        renderPlanner(colonyStore);

        await click("Increase Mine 2 level");

        expect(levelsOf("Mine")).toEqual(["3", "2"]);
      });

      it("keeps data above the limits when the Star Base level is lowered", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 3, { mine: [6, 5, 4, 1] });
        renderPlanner(colonyStore);

        await userEvent.selectOptions(starBaseSelect(), "1");

        expect(levelsOf("Mine")).toEqual(["6", "5", "4", "1"]);
        expect(screen.getByRole("button", { name: "Increase Mine owned" })).toBeDisabled();
        expect(colonyStore.get("main")?.buildings).toEqual({ mine: [6, 5, 4, 1] });
      });

      it("keeps the other Building types when one changes", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [2] });
        renderPlanner(colonyStore);

        await click("Increase Cannon owned");

        expect(colonyStore.get("main")?.buildings).toEqual({ mine: [2], cannon: [1] });
      });

      it("keeps the owned Buildings after a reload", async () => {
        const colonyStore = createMemoryColonyStore();
        const { unmount } = renderPlanner(colonyStore);
        await click("Increase Mine owned");
        await click("Increase Mine owned");
        unmount();

        renderPlanner(colonyStore);

        expect(levelsOf("Mine")).toEqual(["1", "1"]);
      });
    });

    describe("statuses", () => {
      function statusesOf(name: string) {
        return within(screen.getByRole("group", { name }))
          .queryAllByRole("listitem")
          .map((item) => item.textContent);
      }

      function instanceStatusOf(name: string, index: number) {
        return within(screen.getByRole("group", { name })).queryByLabelText(
          `${name} ${index} status`,
        )?.textContent;
      }

      function typeNames() {
        return within(screen.getByRole("tabpanel"))
          .queryAllByRole("group")
          .map((group) => group.getAttribute("aria-label"));
      }

      it("flags a type Missing when the owned count is below the maximum count", () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [3] });
        renderPlanner(colonyStore);

        expect(statusesOf("Mine")).toEqual(["To construct"]);
        expect(statusesOf("Cannon")).toEqual(["To construct"]);
      });

      it("flags a Building below the maximum level as Below limit", () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [3, 2] });
        renderPlanner(colonyStore);

        expect(statusesOf("Mine")).toEqual(["To upgrade"]);
        expect(instanceStatusOf("Mine", 1)).toBeUndefined();
        expect(instanceStatusOf("Mine", 2)).toBe("To upgrade");
      });

      it("flags a type Maxed when nothing is left to build or upgrade", () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [3, 3] });
        renderPlanner(colonyStore);

        expect(statusesOf("Mine")).toEqual(["Maxed"]);
      });

      it("updates the statuses as soon as a level is raised", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { mine: [3, 2] });
        renderPlanner(colonyStore);

        await click("Increase Mine 2 level");

        expect(statusesOf("Mine")).toEqual(["Maxed"]);
      });

      it("flags what exceeds the limits Over limit when the Star Base level is lowered, and keeps it", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 3, { mine: [6, 5, 4, 1] });
        renderPlanner(colonyStore);
        expect(statusesOf("Mine")).toEqual(["To upgrade"]);

        await userEvent.selectOptions(starBaseSelect(), "1");

        expect(statusesOf("Mine")).toEqual(["Over limit"]);
        expect(instanceStatusOf("Mine", 1)).toBe("Over limit");
        expect(instanceStatusOf("Mine", 3)).toBe("Over limit");
        expect(instanceStatusOf("Mine", 4)).toBe("Over limit");
        expect(colonyStore.get("main")?.buildings).toEqual({ mine: [6, 5, 4, 1] });
      });

      it("shows when a type unlocks and never flags it Missing before", async () => {
        renderPlanner();

        const laser = within(screen.getByRole("group", { name: "Laser" }));
        expect(laser.getByText("Unlocks at Star Base 3")).toBeInTheDocument();
        expect(statusesOf("Laser")).toEqual([]);

        await userEvent.selectOptions(starBaseSelect(), "3");

        expect(laser.queryByText(/Unlocks at Star Base/)).toBeNull();
        expect(statusesOf("Laser")).toEqual(["To construct"]);
      });

      describe("upgrade filter", () => {
        const filter = () => screen.getByRole("checkbox", { name: "Only what to upgrade" });

        it("remembers the filter in the settings after a reload", async () => {
          const colonyStore = createMemoryColonyStore();
          const settingsStore = createMemorySettingsStore();
          seed(colonyStore, 1, { observatory: [2], mine: [3, 3] });
          const first = renderPlanner(colonyStore, settingsStore);
          await userEvent.click(filter());
          first.unmount();

          expect(settingsStore.get("planner")).toEqual({
            onlyToUpgrade: true,
            hideWallUpgrades: false,
            updatedAt: NOW,
          });
          const second = renderPlanner(colonyStore, settingsStore);

          expect(filter()).toBeChecked();
          expect(typeNames()).toEqual(["Cannon"]);

          await userEvent.click(filter());
          second.unmount();
          renderPlanner(colonyStore, settingsStore);

          expect(filter()).not.toBeChecked();
        });

        it("shows every type until the filter is switched on", () => {
          renderPlanner();

          expect(filter()).not.toBeChecked();
          expect(typeNames()).toEqual(["Observatory", "Mine", "Cannon", "Laser"]);
        });

        it("lists only the types to build or upgrade", async () => {
          const colonyStore = createMemoryColonyStore();
          seed(colonyStore, 1, { observatory: [2], mine: [3, 3] });
          renderPlanner(colonyStore);

          await userEvent.click(filter());

          expect(typeNames()).toEqual(["Cannon"]);
        });

        it("hides the categories left empty and brings everything back when switched off", async () => {
          const colonyStore = createMemoryColonyStore();
          seed(colonyStore, 1, { observatory: [2], mine: [3, 3], cannon: [1] });
          renderPlanner(colonyStore);

          await userEvent.click(filter());

          expect(typeNames()).toEqual([]);
          expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
            "Next steps",
          ]);

          await userEvent.click(filter());

          expect(typeNames()).toEqual(["Observatory", "Mine", "Cannon", "Laser"]);
        });

        it("drops a type that is only Over limit and keeps one Below limit", async () => {
          const colonyStore = createMemoryColonyStore();
          seed(colonyStore, 3, { observatory: [6], mine: [3, 2], cannon: [3, 3, 1] });
          renderPlanner(colonyStore);
          await userEvent.selectOptions(starBaseSelect(), "1");

          await userEvent.click(filter());

          expect(typeNames()).toEqual(["Mine"]);
        });
      });
    });

    describe("Colony progress", () => {
      function progress(name: string) {
        return within(screen.getByRole("group", { name: `${name} progress` }));
      }

      function bar(name: string) {
        return progress(name).getByRole("progressbar");
      }

      it("shows one bar per Colony, empty without Buildings", () => {
        renderPlanner();

        expect(screen.getAllByRole("progressbar")).toHaveLength(12);
        expect(bar("Main planet")).toHaveAttribute("aria-valuenow", "0");
        expect(bar("Colony 5")).toHaveAttribute("aria-valuenow", "0");
      });

      it("fills with the levels reached over the maximum at the highest Star Base", () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 2, { observatory: [2], mine: [5, 5, 1] });
        renderPlanner(colonyStore);

        expect(bar("Main planet")).toHaveAttribute("aria-valuenow", "30");
      });

      it("caps levels and counts at the highest Star Base limits", () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 3, {
          observatory: [9],
          mine: [7, 6, 6, 6, 6],
          cannon: [3, 3, 3],
          laser: [3],
        });
        renderPlanner(colonyStore);

        expect(bar("Main planet")).toHaveAttribute("aria-valuenow", "100");
      });

      it("ignores main-planet-only Building types in the other Colonies", () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { observatory: [1] });
        colonyStore.set("colony-1", {
          starBaseLevel: 1,
          buildings: { observatory: [6], mine: [6, 6, 6, 6] },
          updatedAt: 1,
        });
        renderPlanner(colonyStore);

        expect(bar("Colony 1")).toHaveAttribute("aria-valuenow", "66");
      });

      it("writes the Star Base level next to the bar", () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 3, {});
        colonyStore.set("colony-2", { starBaseLevel: 2, buildings: {}, updatedAt: 1 });
        renderPlanner(colonyStore);

        expect(screen.getByRole("group", { name: "Main planet progress" })).toHaveTextContent(
          "SB 3",
        );
        expect(screen.getByRole("group", { name: "Colony 1 progress" })).toHaveTextContent("SB 1");
        expect(screen.getByRole("group", { name: "Colony 2 progress" })).toHaveTextContent("SB 2");
      });

      it("follows a Star Base change", async () => {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, 1, { observatory: [2], mine: [3, 3] });
        renderPlanner(colonyStore);

        await userEvent.selectOptions(starBaseSelect(), "2");

        expect(screen.getByRole("group", { name: "Main planet progress" })).toHaveTextContent(
          "SB 2",
        );
        expect(bar("Main planet")).toHaveAttribute("aria-valuenow", "19");
      });
    });

    describe("Next steps", () => {
      function stepCatalog(): Catalog {
        const withTimes = (type: BuildingType, times: (string | null)[]): BuildingType => ({
          ...type,
          levels: times.map((time, index) => ({ level: index + 1, time })),
        });
        const [observatory, mine, cannon, laser] = FIXTURE_CATALOG.buildings;
        return {
          ...FIXTURE_CATALOG,
          buildings: [
            withTimes(observatory, ["1d", "2d", "3d", "4d", "5d", "6d"]),
            withTimes(mine, ["30m", null, "50m", "60m", "70m", "80m"]),
            withTimes(cannon, ["5m", "6m", "7m", "8m", "9m", "10m"]),
            withTimes(laser, ["1m", "2m", "3m", "4m", "5m", "6m"]),
          ],
        };
      }

      function renderSteps(seedBuildings: Record<string, number[]>, starBase = 1) {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, starBase, seedBuildings);
        render(
          <App
            store={createMemoryDropStore()}
            auth={SIGNED_OUT_AUTH}
            now={() => NOW}
            colonyStore={colonyStore}
            catalog={stepCatalog()}
          />,
        );
      }

      function stepItems() {
        return within(screen.getByRole("list", { name: "Next steps" })).getAllByRole("listitem");
      }

      function steps() {
        return stepItems().map((item) => {
          const [label, time] = item.children;
          return `${label.textContent} | ${time.textContent}`;
        });
      }

      function orderSelect() {
        return screen.getByRole("combobox", { name: "Order" });
      }

      it("lists one step per Building to build or upgrade with its time", () => {
        renderSteps({ observatory: [2], mine: [3, 2] });

        expect(steps()).toEqual(["Build Cannon | 5m", "Upgrade Mine to level 3 | 50m"]);
      });

      it("puts builds first, fastest first by default and longest first on demand", async () => {
        renderSteps({ observatory: [1], mine: [3, 2] });
        expect(orderSelect()).toHaveDisplayValue("Fastest first");
        expect(steps()).toEqual([
          "Build Cannon | 5m",
          "Upgrade Mine to level 3 | 50m",
          "Upgrade Observatory to level 2 | 2d",
        ]);

        await userEvent.selectOptions(orderSelect(), "Longest first");

        expect(steps()).toEqual([
          "Build Cannon | 5m",
          "Upgrade Observatory to level 2 | 2d",
          "Upgrade Mine to level 3 | 50m",
        ]);
      });

      it("says the time is unknown and sorts that step last in both orders", async () => {
        renderSteps({ observatory: [1], mine: [3, 1] });
        expect(steps()).toEqual([
          "Build Cannon | 5m",
          "Upgrade Observatory to level 2 | 2d",
          "Upgrade Mine to level 2 | time unknown",
        ]);

        await userEvent.selectOptions(orderSelect(), "Longest first");

        expect(steps()).toEqual([
          "Build Cannon | 5m",
          "Upgrade Observatory to level 2 | 2d",
          "Upgrade Mine to level 2 | time unknown",
        ]);
      });

      it("keeps only the steps of the chosen category", async () => {
        renderSteps({}, 3);

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Category" }), "Tower");

        expect(steps()).toEqual([
          "Build Laser | 1m",
          "Build Cannon | 5m",
          "Build Cannon | 5m",
          "Build Cannon | 5m",
        ]);

        await userEvent.selectOptions(
          screen.getByRole("combobox", { name: "Category" }),
          "All categories",
        );

        expect(screen.getByRole("button", { name: "Show all 9 steps" })).toBeInTheDocument();
      });

      it("never recommends a type the Star Base level has not unlocked", async () => {
        renderSteps({ observatory: [2], mine: [3, 3] });

        expect(steps().filter((step) => step.includes("Laser"))).toEqual([]);

        await userEvent.selectOptions(starBaseSelect(), "3");
        await userEvent.selectOptions(orderSelect(), "Fastest first");

        expect(steps().filter((step) => step.includes("Laser"))).toEqual(["Build Laser | 1m"]);
      });

      it("shows only five steps by default with a toggle for the rest", async () => {
        renderSteps({}, 3);

        expect(steps()).toHaveLength(5);

        await userEvent.click(screen.getByRole("button", { name: "Show all 9 steps" }));

        expect(steps()).toHaveLength(9);

        await userEvent.click(screen.getByRole("button", { name: "Show fewer steps" }));

        expect(steps()).toHaveLength(5);
      });

      it("offers no toggle when five steps or fewer exist", () => {
        renderSteps({ observatory: [2], mine: [3, 2] });

        expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
      });

      it("says so when nothing is left to build or upgrade", () => {
        renderSteps({ observatory: [2], mine: [3, 3], cannon: [1] });

        expect(screen.getByText("Nothing to build or upgrade")).toBeInTheDocument();
        expect(screen.queryByRole("list", { name: "Next steps" })).toBeNull();
      });

      it("updates the list when a Building is edited", async () => {
        renderSteps({ observatory: [2], mine: [3, 2] });

        await typeAndCommit(screen.getByRole("spinbutton", { name: "Mine 2 level" }), "3");

        expect(steps()).toEqual(["Build Cannon | 5m"]);
      });

      describe("Done", () => {
        it("adds an instance at level 1 for a build step", async () => {
          renderSteps({ observatory: [2], mine: [3, 3] });

          await click("Done Build Cannon");

          expect(levelsOf("Cannon")).toEqual(["1"]);
          expect(screen.getByText("Nothing to build or upgrade")).toBeInTheDocument();
        });

        it("raises that Building by one level for an upgrade step", async () => {
          renderSteps({ observatory: [2], mine: [3, 2], cannon: [1] });

          await click("Done Upgrade Mine to level 3");

          expect(levelsOf("Mine")).toEqual(["3", "3"]);
          expect(
            within(screen.getByRole("group", { name: "Mine" })).getByRole("list", {
              name: "Statuses",
            }),
          ).toHaveTextContent("Maxed");
          expect(screen.getByText("Nothing to build or upgrade")).toBeInTheDocument();
        });

        it("keeps the levels in descending order", async () => {
          renderSteps({ observatory: [2], mine: [2, 2], cannon: [1] });

          await userEvent.click(
            screen.getAllByRole("button", { name: "Done Upgrade Mine to level 3" })[1],
          );

          expect(levelsOf("Mine")).toEqual(["3", "2"]);
          expect(steps()).toEqual(["Upgrade Mine to level 3 | 50m"]);
        });

        it("saves the change to the Colony", async () => {
          const colonyStore = createMemoryColonyStore();
          seed(colonyStore, 1, { observatory: [2], mine: [3, 2] });
          render(
            <App
              store={createMemoryDropStore()}
              auth={SIGNED_OUT_AUTH}
              now={() => NOW}
              colonyStore={colonyStore}
              catalog={stepCatalog()}
            />,
          );

          await click("Done Build Cannon");

          expect(colonyStore.get("main")).toEqual({
            starBaseLevel: 1,
            buildings: { observatory: [2], mine: [3, 2], cannon: [1] },
            updatedAt: NOW,
          });
        });
      });

      describe("Constructions", () => {
        const MINUTE = 60 * 1000;
        let time = NOW;

        beforeEach(() => {
          time = NOW;
          vi.useFakeTimers({ shouldAdvanceTime: true });
        });
        afterEach(() => vi.useRealTimers());

        function renderConstructions(seedBuildings: Record<string, number[]>, starBase = 1) {
          const colonyStore = createMemoryColonyStore();
          seed(colonyStore, starBase, seedBuildings);
          render(
            <App
              store={createMemoryDropStore()}
              auth={SIGNED_OUT_AUTH}
              now={() => time}
              colonyStore={colonyStore}
              catalog={stepCatalog()}
            />,
          );
          return colonyStore;
        }

        function passTime(ms: number) {
          time += ms;
          act(() => {
            vi.advanceTimersByTime(1000);
          });
        }

        it("offers Start next to Done on every step whose time is known", () => {
          renderConstructions({ observatory: [1], mine: [3, 1] });

          expect(
            stepItems().map(
              (item) => within(item).queryByRole("button", { name: /^Start/ })?.textContent ?? null,
            ),
          ).toEqual(["Start", "Start", null]);
          expect(screen.getByRole("button", { name: "Start Build Cannon" })).toBeInTheDocument();
          expect(
            screen.queryByRole("button", { name: "Start Upgrade Mine to level 2" }),
          ).toBeNull();
        });

        it("shows a started step at the top with a countdown from the catalog time, not repeated below", async () => {
          const colonyStore = renderConstructions({ observatory: [2], mine: [3, 2] });

          await click("Start Upgrade Mine to level 3");

          expect(steps()).toEqual(["Upgrade Mine to level 3 | 00:50:00", "Build Cannon | 5m"]);
          expect(colonyStore.get("main")?.constructions).toEqual([
            {
              kind: "upgrade",
              typeId: "mine",
              instance: 2,
              count: 1,
              targetLevel: 3,
              finishAt: NOW + 50 * MINUTE,
            },
          ]);
          expect(colonyStore.get("main")?.buildings).toEqual({ observatory: [2], mine: [3, 2] });
        });

        it("counts the countdown down with the clock", async () => {
          renderConstructions({ observatory: [2], mine: [3, 2] });
          await click("Start Upgrade Mine to level 3");

          passTime(20 * MINUTE);

          expect(steps()[0]).toBe("Upgrade Mine to level 3 | 00:30:00");
        });

        it("hides only the started build when several are missing", async () => {
          renderConstructions({ observatory: [2], mine: [3, 3] }, 2);

          await userEvent.click(screen.getAllByRole("button", { name: "Start Build Cannon" })[0]);

          expect(steps()).toEqual([
            "Build Cannon | 00:05:00",
            "Build Cannon | 5m",
            "Build Mine | 30m",
            "Upgrade Mine to level 4 | 60m",
            "Upgrade Mine to level 4 | 60m",
          ]);
        });

        it("counts Constructions in the five steps shown by default", async () => {
          renderConstructions({}, 3);

          await click("Start Build Laser");

          expect(steps()).toHaveLength(5);
          expect(steps()[0]).toBe("Build Laser | 00:01:00");
          expect(screen.getByRole("button", { name: "Show all 9 steps" })).toBeInTheDocument();
        });

        it("applies the step and removes the Construction on Done before the Finish date", async () => {
          const colonyStore = renderConstructions({ observatory: [2], mine: [3, 2] });
          await click("Start Upgrade Mine to level 3");

          await click("Done Upgrade Mine to level 3");

          expect(levelsOf("Mine")).toEqual(["3", "3"]);
          expect(steps()).toEqual(["Build Cannon | 5m"]);
          expect(colonyStore.get("main")?.constructions ?? []).toEqual([]);
        });

        it("applies the step on Done after the Finish date", async () => {
          const colonyStore = renderConstructions({ observatory: [2], mine: [3, 3] });
          await click("Start Build Cannon");
          passTime(10 * MINUTE);

          expect(steps()).toEqual(["Build Cannon | 00:00:00"]);
          await click("Done Build Cannon");

          expect(levelsOf("Cannon")).toEqual(["1"]);
          expect(screen.getByText("Nothing to build or upgrade")).toBeInTheDocument();
          expect(colonyStore.get("main")?.constructions ?? []).toEqual([]);
        });

        it("asks for a confirmation before cancelling and keeps the Construction when declined", async () => {
          const colonyStore = renderConstructions({ observatory: [2], mine: [3, 2] });
          await click("Start Upgrade Mine to level 3");

          await click("Cancel Upgrade Mine to level 3");

          expect(screen.getByText("Cancel this Construction?")).toBeInTheDocument();
          await click("Keep Upgrade Mine to level 3");

          expect(screen.queryByText("Cancel this Construction?")).toBeNull();
          expect(steps()[0]).toBe("Upgrade Mine to level 3 | 00:50:00");
          expect(colonyStore.get("main")?.constructions).toHaveLength(1);
        });

        it("removes the Construction without changing the Colony when the cancel is confirmed", async () => {
          const colonyStore = renderConstructions({ observatory: [2], mine: [3, 2] });
          await click("Start Upgrade Mine to level 3");

          await click("Cancel Upgrade Mine to level 3");
          await click("Confirm cancel Upgrade Mine to level 3");

          expect(steps()).toEqual(["Build Cannon | 5m", "Upgrade Mine to level 3 | 50m"]);
          expect(colonyStore.get("main")).toEqual({
            starBaseLevel: 1,
            buildings: { observatory: [2], mine: [3, 2] },
            updatedAt: NOW,
          });
        });

        it("applies an upgrade to a Building still below its target after the levels were reordered", async () => {
          const colonyStore = renderConstructions({ observatory: [2], mine: [4, 3] }, 2);
          await click("Start Upgrade Mine to level 5");

          await typeAndCommit(screen.getByRole("spinbutton", { name: "Mine 2 level" }), "5");
          await userEvent.click(
            screen.getAllByRole("button", { name: "Done Upgrade Mine to level 5" })[0],
          );

          expect(colonyStore.get("main")?.buildings.mine).toEqual([5, 5]);
        });

        it("leaves the levels alone when the upgrade was already applied by hand", async () => {
          const colonyStore = renderConstructions({ observatory: [2], mine: [3, 2] }, 2);
          await click("Start Upgrade Mine to level 4");

          await typeAndCommit(screen.getByRole("spinbutton", { name: "Mine 1 level" }), "5");
          await click("Done Upgrade Mine to level 4");

          expect(colonyStore.get("main")?.buildings.mine).toEqual([5, 2]);
          expect(colonyStore.get("main")?.constructions ?? []).toEqual([]);
        });

        it("disables Start once ten Constructions are running", () => {
          const colonyStore = createMemoryColonyStore();
          colonyStore.set("main", {
            starBaseLevel: 1,
            buildings: { observatory: [2], mine: [3, 3] },
            constructions: Array.from({ length: 10 }, () => ({
              kind: "upgrade" as const,
              typeId: "observatory",
              instance: 1,
              count: 1,
              targetLevel: 3,
              finishAt: NOW + MINUTE,
            })),
            updatedAt: 1,
          });
          render(
            <App
              store={createMemoryDropStore()}
              auth={SIGNED_OUT_AUTH}
              now={() => time}
              colonyStore={colonyStore}
              catalog={stepCatalog()}
            />,
          );
          act(() => screen.getByRole("button", { name: "Show all 11 steps" }).click());

          expect(screen.getByRole("button", { name: "Start Build Cannon" })).toBeDisabled();
        });

        it("keeps Constructions after a reload", async () => {
          const colonyStore = renderConstructions({ observatory: [2], mine: [3, 2] });
          await click("Start Upgrade Mine to level 3");
          cleanup();

          time = NOW + 10 * MINUTE;
          render(
            <App
              store={createMemoryDropStore()}
              auth={SIGNED_OUT_AUTH}
              now={() => time}
              colonyStore={colonyStore}
              catalog={stepCatalog()}
            />,
          );

          expect(steps()[0]).toBe("Upgrade Mine to level 3 | 00:40:00");
        });
      });
    });

    describe("Walls, which share one level", () => {
      function wallsCatalog(): Catalog {
        const [observatory] = FIXTURE_CATALOG.buildings;
        return {
          ...FIXTURE_CATALOG,
          buildings: [
            observatory,
            {
              ...fixtureType("walls", "Walls", "Defense", false, [
                [3, 1],
                [4, 2],
                [5, 3],
              ]),
              sharedLevel: true,
              levels: [
                { level: 1, time: "0s" },
                { level: 2, time: "0s" },
                { level: 3, time: "0s" },
              ],
            },
          ],
        };
      }

      function renderWalls(
        walls: number[],
        starBase = 3,
        settingsStore: SettingsStore = createMemorySettingsStore(),
      ) {
        const colonyStore = createMemoryColonyStore();
        seed(colonyStore, starBase, { observatory: [6], walls });
        render(
          <App
            store={createMemoryDropStore()}
            auth={SIGNED_OUT_AUTH}
            now={() => NOW}
            colonyStore={colonyStore}
            settingsStore={settingsStore}
            catalog={wallsCatalog()}
          />,
        );
        return colonyStore;
      }

      function wallsLevel() {
        return screen.getByRole("spinbutton", { name: "Walls level" });
      }

      it("leaves Walls out of the Colony progress", () => {
        renderWalls([]);

        expect(
          within(screen.getByRole("group", { name: "Main planet progress" })).getByRole(
            "progressbar",
          ),
        ).toHaveAttribute("aria-valuenow", "100");
      });

      function stepList() {
        return within(screen.getByRole("list", { name: "Next steps" }));
      }

      it("shows one level for every Wall", () => {
        renderWalls([2, 2, 2]);

        expect(wallsLevel()).toHaveValue(2);
        expect(
          within(screen.getByRole("group", { name: "Walls" })).getAllByRole("spinbutton"),
        ).toHaveLength(2);
      });

      it("raises every Wall at once", async () => {
        const colonyStore = renderWalls([2, 2, 2]);

        await click("Increase Walls level");

        expect(wallsLevel()).toHaveValue(3);
        expect(colonyStore.get("main")?.buildings.walls).toEqual([3, 3, 3]);
      });

      it("adds new Walls at the shared level", async () => {
        const colonyStore = renderWalls([2, 2, 2]);

        await click("Increase Walls owned");

        expect(colonyStore.get("main")?.buildings.walls).toEqual([2, 2, 2, 2]);
      });

      it("recommends one step to upgrade every Wall and one to build the missing ones", () => {
        renderWalls([2, 2, 2]);

        expect(stepList().getByText("Upgrade 3 Walls to level 3")).toBeInTheDocument();
        expect(stepList().getByText("Build 2 Walls")).toBeInTheDocument();
        expect(stepList().getAllByRole("listitem")).toHaveLength(2);
      });

      it("raises every Wall when the upgrade step is done", async () => {
        const colonyStore = renderWalls([2, 2, 2]);

        await click("Done Upgrade 3 Walls to level 3");

        expect(colonyStore.get("main")?.buildings.walls).toEqual([3, 3, 3]);
      });

      it("builds every missing Wall at the shared level when the build step is done", async () => {
        const colonyStore = renderWalls([2, 2, 2]);

        await click("Done Build 2 Walls");

        expect(colonyStore.get("main")?.buildings.walls).toEqual([2, 2, 2, 2, 2]);
      });

      it("recommends building the first Walls at level 1", () => {
        renderWalls([], 1);

        expect(stepList().getByText("Build 3 Walls")).toBeInTheDocument();
      });

      describe("hide wall upgrades", () => {
        const hideWallUpgrades = () => screen.getByRole("checkbox", { name: "Hide wall upgrades" });

        it("shows wall upgrades until the option is switched on", () => {
          renderWalls([2, 2, 2]);

          expect(hideWallUpgrades()).not.toBeChecked();
          expect(stepList().getByText("Upgrade 3 Walls to level 3")).toBeInTheDocument();
        });

        it("hides the wall upgrade step but keeps the wall build step", async () => {
          renderWalls([2, 2, 2]);

          await userEvent.click(hideWallUpgrades());

          expect(stepList().queryByText("Upgrade 3 Walls to level 3")).not.toBeInTheDocument();
          expect(stepList().getByText("Build 2 Walls")).toBeInTheDocument();
          expect(stepList().getAllByRole("listitem")).toHaveLength(1);
        });

        it("remembers the option in the settings after a reload", async () => {
          const settingsStore = createMemorySettingsStore();
          renderWalls([2, 2, 2], 3, settingsStore);
          await userEvent.click(hideWallUpgrades());
          cleanup();

          expect(settingsStore.get("planner")).toEqual({
            onlyToUpgrade: false,
            hideWallUpgrades: true,
            updatedAt: NOW,
          });
          renderWalls([2, 2, 2], 3, settingsStore);

          expect(hideWallUpgrades()).toBeChecked();
          expect(stepList().queryByText("Upgrade 3 Walls to level 3")).not.toBeInTheDocument();
        });
      });
    });
  });

  it("shows a Drop with no saved Ready date as not started", () => {
    render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

    const starBattery = chip("Star Battery");
    expect(starBattery.getByText("--:--:--")).toBeInTheDocument();
    expect(starBattery.getByRole("button", { name: "Start Star Battery timer" })).toBeEnabled();
  });

  it("starts the Cooldown immediately when the player presses the relaunch button", async () => {
    render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

    await userEvent.click(
      chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
    );

    expect(chip("Star Battery").getByText("11:00:00")).toBeInTheDocument();
    expect(chip("Tool Case").getByText("--:--:--")).toBeInTheDocument();
  });

  it("keeps a running Cooldown after a reload", async () => {
    const store = createMemoryDropStore();
    const { unmount } = render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
    await userEvent.click(chip("Tool Case").getByRole("button", { name: "Start Tool Case timer" }));
    unmount();

    const twoHoursLater = NOW + 2 * 3600 * 1000;
    render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => twoHoursLater} />);

    expect(chip("Tool Case").getByText("21:00:00")).toBeInTheDocument();
  });

  describe("with a corrupted stored Ready date", () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it.each(["abc", "NaN", "Infinity", "-Infinity"])(
      "shows the Drop as not started when the stored value is %s",
      (value) => {
        localStorage.setItem("gl-timer-star-battery", value);

        render(
          <App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />,
        );

        const starBattery = chip("Star Battery");
        expect(starBattery.getByText("--:--:--")).toBeInTheDocument();
        expect(starBattery.getByRole("button", { name: "Start Star Battery timer" })).toBeEnabled();
      },
    );
  });

  describe("advanced settings, manual Ready date editor", () => {
    async function openEditor(name: string) {
      await openAdvanced(name);
      await userEvent.click(
        card(name).getByRole("button", { name: `Set ${name} Ready date manually` }),
      );
      return card(name).getByDisplayValue(/.*/) as HTMLInputElement;
    }

    it("saves a valid date and shows the matching Ready date", async () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      const input = await openEditor("Star Battery");
      await userEvent.clear(input);
      await userEvent.type(input, "2026-01-01T18:30");
      await userEvent.click(card("Star Battery").getByRole("button", { name: "Save" }));

      expect(card("Star Battery").getByText("06:30:00")).toBeInTheDocument();
      expect(card("Star Battery").getByText(/^01\/01 at /)).toBeInTheDocument();
      expect(card("Star Battery").queryByRole("alert")).not.toBeInTheDocument();
    });

    it("rejects an invalid date, shows an error and keeps the previous Ready date", async () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      await userEvent.click(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      );

      const input = await openEditor("Star Battery");
      await userEvent.clear(input);
      await userEvent.click(card("Star Battery").getByRole("button", { name: "Save" }));

      expect(card("Star Battery").getByRole("alert")).toHaveTextContent(/invalid date/i);

      await userEvent.click(card("Star Battery").getByRole("button", { name: "Cancel" }));

      expect(card("Star Battery").getByText("11:00:00")).toBeInTheDocument();
      expect(card("Star Battery").queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("advanced settings, reset confirmation", () => {
    async function startAndPressReset(name: string) {
      await userEvent.click(chip(name).getByRole("button", { name: `Start ${name} timer` }));
      await openAdvanced(name);
      await userEvent.click(card(name).getByRole("button", { name: `Reset ${name} timer` }));
    }

    it("asks for confirmation and keeps the Ready date until confirmed", async () => {
      const store = createMemoryDropStore();
      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await startAndPressReset("Star Battery");

      expect(card("Star Battery").getByText("11:00:00")).toBeInTheDocument();
      expect(store.get("gl-timer-star-battery")?.readyAt).toBe(NOW + 11 * 3600 * 1000);

      expect(card("Star Battery").getByText(/reset this timer\?/i)).toBeInTheDocument();
      expect(card("Star Battery").getByRole("button", { name: "Reset" })).toBeVisible();
      expect(card("Star Battery").getByRole("button", { name: "Cancel" })).toBeVisible();
    });

    it("clears the Ready date when the player confirms", async () => {
      const store = createMemoryDropStore();
      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      await startAndPressReset("Star Battery");

      await userEvent.click(card("Star Battery").getByRole("button", { name: "Reset" }));

      expect(card("Star Battery").getByText("--:--:--")).toBeInTheDocument();
      expect(card("Star Battery").getByRole("button", { name: "Start timer" })).toBeEnabled();
      expect(card("Star Battery").queryByRole("button", { name: "Reset" })).toBeNull();
      expect(store.get("gl-timer-star-battery")?.readyAt).toBeNull();
    });

    it("keeps the Ready date when the player cancels", async () => {
      const store = createMemoryDropStore();
      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      await startAndPressReset("Star Battery");

      await userEvent.click(card("Star Battery").getByRole("button", { name: "Cancel" }));

      expect(card("Star Battery").getByText("11:00:00")).toBeInTheDocument();
      expect(card("Star Battery").queryByRole("button", { name: "Reset" })).toBeNull();
      expect(store.get("gl-timer-star-battery")?.readyAt).toBe(NOW + 11 * 3600 * 1000);
    });

    it("only affects the Drop whose reset was pressed", async () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      await userEvent.click(
        chip("Tool Case").getByRole("button", { name: "Start Tool Case timer" }),
      );

      await startAndPressReset("Star Battery");

      expect(chip("Tool Case").getByText("23:00:00")).toBeInTheDocument();
    });
  });

  describe("updated-at tracking", () => {
    it("records the current time as updated-at when a Drop is Collected", async () => {
      const store = createMemoryDropStore();
      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await userEvent.click(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      );

      expect(store.get("gl-timer-star-battery")?.updatedAt).toBe(NOW);
    });

    it("records the current time as updated-at when a Ready date is edited manually", async () => {
      const store = createMemoryDropStore();
      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await openAdvanced("Star Battery");
      await userEvent.click(
        card("Star Battery").getByRole("button", { name: "Set Star Battery Ready date manually" }),
      );
      const input = card("Star Battery").getByDisplayValue(/.*/) as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, "2026-01-01T18:30");
      await userEvent.click(card("Star Battery").getByRole("button", { name: "Save" }));

      expect(store.get("gl-timer-star-battery")?.updatedAt).toBe(NOW);
    });

    it("records the current time as updated-at when a Drop is reset", async () => {
      const store = createMemoryDropStore();
      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      await userEvent.click(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      );
      await openAdvanced("Star Battery");
      await userEvent.click(
        card("Star Battery").getByRole("button", { name: "Reset Star Battery timer" }),
      );

      await userEvent.click(card("Star Battery").getByRole("button", { name: "Reset" }));

      expect(store.get("gl-timer-star-battery")?.updatedAt).toBe(NOW);
    });

    describe("a legacy value stored before this change", () => {
      beforeEach(() => localStorage.clear());
      afterEach(() => localStorage.clear());

      it("is read as the current Ready date and treated as the oldest possible value", () => {
        localStorage.setItem("gl-timer-star-battery", String(NOW + 3 * 3600 * 1000));
        const store = createLocalStorageDropStore();

        render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

        expect(chip("Star Battery").getByText("03:00:00")).toBeInTheDocument();
        expect(store.get("gl-timer-star-battery")).toEqual({
          readyAt: NOW + 3 * 3600 * 1000,
          updatedAt: OLDEST_UPDATED_AT,
        });
      });
    });
  });

  describe("tab title", () => {
    const DEFAULT_TITLE = "GL Upgrade Planner";

    beforeEach(() => {
      document.title = DEFAULT_TITLE;
      vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it("shows the number of Ready Drops", () => {
      const store = createMemoryDropStore({
        "gl-timer-star-battery": NOW - 1000,
        "gl-timer-tool-case": NOW - 1,
        "gl-timer-helmet": NOW + 3600 * 1000,
      });

      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      expect(document.title).toBe(`(2) ${DEFAULT_TITLE}`);
    });

    it("updates when a Drop becomes Ready", () => {
      let time = NOW;
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => time} />);
      act(() => screen.getByRole("button", { name: "Start Star Battery timer" }).click());
      expect(document.title).toBe(DEFAULT_TITLE);

      time = NOW + 12 * 3600 * 1000;
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(document.title).toBe(`(1) ${DEFAULT_TITLE}`);
    });

    it("keeps the default title when no Drop is Ready", () => {
      const store = createMemoryDropStore({ "gl-timer-star-battery": NOW + 3600 * 1000 });

      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      expect(document.title).toBe(DEFAULT_TITLE);
    });

    it("returns to the default title once the Ready Drop is reset", () => {
      const store = createMemoryDropStore({ "gl-timer-star-battery": NOW - 1000 });
      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      expect(document.title).toBe(`(1) ${DEFAULT_TITLE}`);

      act(() => screen.getByRole("button", { name: "Advanced settings for Star Battery" }).click());
      act(() =>
        card("Star Battery").getByRole("button", { name: "Reset Star Battery timer" }).click(),
      );
      act(() => card("Star Battery").getByRole("button", { name: "Reset" }).click());
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(document.title).toBe(DEFAULT_TITLE);
    });

    it("restores the default title when the app unmounts", () => {
      const store = createMemoryDropStore({ "gl-timer-star-battery": NOW - 1000 });
      const { unmount } = render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      unmount();

      expect(document.title).toBe(DEFAULT_TITLE);
    });
  });

  describe("cross-tab synchronization", () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    function otherTabWrites(key: string, value: string | null) {
      const oldValue = localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key,
            oldValue,
            newValue: value,
            storageArea: localStorage,
          }),
        );
      });
    }

    it("shows a Ready date set in another tab without reload", () => {
      render(<App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      expect(chip("Star Battery").getByText("--:--:--")).toBeInTheDocument();

      otherTabWrites("gl-timer-star-battery", String(NOW + 3 * 3600 * 1000));

      expect(chip("Star Battery").getByText("03:00:00")).toBeInTheDocument();
      expect(chip("Tool Case").getByText("--:--:--")).toBeInTheDocument();
    });

    it("shows a Ready date changed in another tab", () => {
      localStorage.setItem("gl-timer-star-battery", String(NOW + 3 * 3600 * 1000));
      render(<App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      otherTabWrites("gl-timer-star-battery", String(NOW + 5 * 3600 * 1000));

      expect(chip("Star Battery").getByText("05:00:00")).toBeInTheDocument();
    });

    it("shows a Drop as not started when it is reset in another tab", () => {
      localStorage.setItem("gl-timer-star-battery", String(NOW + 3 * 3600 * 1000));
      render(<App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      otherTabWrites("gl-timer-star-battery", null);

      expect(chip("Star Battery").getByText("--:--:--")).toBeInTheDocument();
      expect(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      ).toBeEnabled();
    });

    it("shows every Drop as not started when the storage is cleared in another tab", () => {
      localStorage.setItem("gl-timer-star-battery", String(NOW + 3 * 3600 * 1000));
      localStorage.setItem("gl-timer-tool-case", String(NOW + 4 * 3600 * 1000));
      render(<App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      localStorage.clear();
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
      });

      expect(chip("Star Battery").getByText("--:--:--")).toBeInTheDocument();
      expect(chip("Tool Case").getByText("--:--:--")).toBeInTheDocument();
    });

    it("ignores changes to unrelated keys and to session storage", () => {
      localStorage.setItem("gl-timer-star-battery", String(NOW + 3 * 3600 * 1000));
      render(<App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      otherTabWrites("unrelated", "1");
      sessionStorage.setItem("gl-timer-star-battery", String(NOW + 9 * 3600 * 1000));
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "gl-timer-star-battery",
            newValue: String(NOW + 9 * 3600 * 1000),
            storageArea: sessionStorage,
          }),
        );
      });
      sessionStorage.clear();

      expect(chip("Star Battery").getByText("03:00:00")).toBeInTheDocument();
    });

    it("dismisses a pending reset confirmation when another tab already reset the Drop", async () => {
      render(<App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      await userEvent.click(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      );
      await openAdvanced("Star Battery");
      await userEvent.click(
        card("Star Battery").getByRole("button", { name: "Reset Star Battery timer" }),
      );
      expect(card("Star Battery").getByText(/reset this timer\?/i)).toBeInTheDocument();

      otherTabWrites("gl-timer-star-battery", null);

      expect(card("Star Battery").queryByText(/reset this timer\?/i)).toBeNull();
      expect(card("Star Battery").getByRole("button", { name: "Start timer" })).toBeEnabled();
    });
  });

  describe("pending reset confirmation and a newer Ready date from another tab", () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it("dismisses the confirmation so the newer Ready date is not wiped", async () => {
      render(<App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      await userEvent.click(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      );
      await openAdvanced("Star Battery");
      await userEvent.click(
        card("Star Battery").getByRole("button", { name: "Reset Star Battery timer" }),
      );

      const newer = String(NOW + 2 * 3600 * 1000);
      localStorage.setItem("gl-timer-star-battery", newer);
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "gl-timer-star-battery",
            newValue: newer,
            storageArea: localStorage,
          }),
        );
      });

      expect(card("Star Battery").queryByRole("button", { name: "Reset" })).toBeNull();
      expect(card("Star Battery").getByText("02:00:00")).toBeInTheDocument();
    });
  });

  describe("browser notifications", () => {
    type Sent = { title: string; options?: NotificationOptions };

    function installFakeNotification(
      initial: NotificationPermission,
      answer: NotificationPermission = "granted",
    ) {
      const sent: Sent[] = [];
      const requestPermission = vi.fn(async () => {
        FakeNotification.permission = answer;
        return answer;
      });
      class FakeNotification {
        static permission: NotificationPermission = initial;
        static requestPermission = requestPermission;
        constructor(title: string, options?: NotificationOptions) {
          sent.push({ title, options });
        }
      }
      vi.stubGlobal("Notification", FakeNotification);
      return { sent, requestPermission };
    }

    function tick(ms = 1000) {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    }

    async function enableNotifications() {
      await act(async () => {
        screen.getByRole("button", { name: "Enable notifications" }).click();
      });
    }

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("never requests permission on first load", () => {
      const { requestPermission } = installFakeNotification("default");

      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      tick(5000);

      expect(requestPermission).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Enable notifications" })).toBeEnabled();
    });

    it("requests permission only from the enable action", async () => {
      const { requestPermission } = installFakeNotification("default");
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await enableNotifications();

      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: "Enable notifications" })).toBeNull();
      expect(screen.getByText("Notifications enabled")).toBeInTheDocument();
    });

    it("shows a popup confirming notifications were enabled", async () => {
      installFakeNotification("default");
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await enableNotifications();

      expect(screen.getByRole("dialog", { name: "Notifications enabled" })).toBeInTheDocument();
    });

    it("shows a popup explaining notifications were blocked", async () => {
      installFakeNotification("default", "denied");
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await enableNotifications();

      expect(screen.getByRole("dialog", { name: "Notifications blocked" })).toBeInTheDocument();
    });

    it("sends one notification per Drop when it goes from running to Ready", () => {
      const { sent } = installFakeNotification("granted");
      let time = NOW;
      const store = createMemoryDropStore({
        "gl-timer-star-battery": NOW + 60 * 1000,
        "gl-timer-tool-case": NOW + 3600 * 1000,
      });
      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => time} />);

      tick(3000);
      expect(sent).toHaveLength(0);

      time = NOW + 2 * 60 * 1000;
      tick();
      tick();
      tick();

      expect(sent).toHaveLength(1);
      expect(sent[0].title).toBe("Star Battery is ready");
    });

    it("sends a new notification when the same Drop becomes Ready again", () => {
      const { sent } = installFakeNotification("granted");
      let time = NOW;
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => time} />);
      act(() => screen.getByRole("button", { name: "Start Star Battery timer" }).click());
      tick();

      time = NOW + 12 * 3600 * 1000;
      tick();
      expect(sent).toHaveLength(1);

      act(() => screen.getByRole("button", { name: "Collect Star Battery" }).click());
      tick();
      time += 12 * 3600 * 1000;
      tick();

      expect(sent).toHaveLength(2);
    });

    it("sends nothing for a Drop already Ready at load", () => {
      const { sent } = installFakeNotification("granted");
      const store = createMemoryDropStore({ "gl-timer-star-battery": NOW - 1000 });

      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      tick(5000);

      expect(sent).toHaveLength(0);
    });

    it("sends nothing for a Ready date set by hand in the past", async () => {
      const { sent } = installFakeNotification("granted");
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      tick();

      act(() => screen.getByRole("button", { name: "Advanced settings for Star Battery" }).click());
      act(() =>
        card("Star Battery")
          .getByRole("button", { name: "Set Star Battery Ready date manually" })
          .click(),
      );
      const input = card("Star Battery").getByDisplayValue(/.*/) as HTMLInputElement;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          "2025-12-31T10:00",
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      act(() => card("Star Battery").getByRole("button", { name: "Save" }).click());
      tick(3000);

      expect(card("Star Battery").getByText("Ready!")).toBeInTheDocument();
      expect(sent).toHaveLength(0);
    });

    it("sends nothing when a running timer is reset", () => {
      const { sent } = installFakeNotification("granted");
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      act(() => screen.getByRole("button", { name: "Start Star Battery timer" }).click());
      tick();

      act(() => screen.getByRole("button", { name: "Advanced settings for Star Battery" }).click());
      act(() =>
        card("Star Battery").getByRole("button", { name: "Reset Star Battery timer" }).click(),
      );
      act(() => card("Star Battery").getByRole("button", { name: "Reset" }).click());
      tick(3000);

      expect(sent).toHaveLength(0);
    });

    it("keeps checking the other Drops when a notification cannot be created", () => {
      const { sent } = installFakeNotification("granted");
      const Working = Notification;
      let calls = 0;
      vi.stubGlobal(
        "Notification",
        Object.assign(
          function (title: string, options?: NotificationOptions) {
            calls += 1;
            if (calls === 1) throw new Error("Illegal constructor");
            return new Working(title, options);
          },
          { permission: "granted", requestPermission: vi.fn() },
        ),
      );
      let time = NOW;
      const store = createMemoryDropStore({
        "gl-timer-star-battery": NOW + 60 * 1000,
        "gl-timer-tool-case": NOW + 60 * 1000,
      });
      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => time} />);
      tick();

      time = NOW + 2 * 60 * 1000;
      tick();

      expect(sent).toHaveLength(1);
    });

    it("keeps working and sends nothing when permission is denied", () => {
      const { sent } = installFakeNotification("denied");
      let time = NOW;
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => time} />);

      act(() => screen.getByRole("button", { name: "Start Star Battery timer" }).click());
      expect(chip("Star Battery").getByText("11:00:00")).toBeInTheDocument();
      tick();
      time = NOW + 12 * 3600 * 1000;
      tick();

      expect(chip("Star Battery").getByText("Ready!")).toBeInTheDocument();
      expect(sent).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Enable notifications" })).toBeNull();
      expect(screen.getByText("Notifications blocked")).toBeInTheDocument();
    });

    it("sends nothing when the player refuses the permission prompt", async () => {
      const { sent } = installFakeNotification("default", "denied");
      let time = NOW;
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => time} />);
      await enableNotifications();

      act(() => screen.getByRole("button", { name: "Start Star Battery timer" }).click());
      time = NOW + 12 * 3600 * 1000;
      tick();

      expect(sent).toHaveLength(0);
      expect(screen.getByText("Notifications blocked")).toBeInTheDocument();
    });

    it("works without any notification support", () => {
      vi.stubGlobal("Notification", undefined);

      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      expect(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      ).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Enable notifications" })).toBeNull();
    });
  });

  describe("account", () => {
    it("lets a visitor use a Drop timer without signing in", async () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await userEvent.click(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      );

      expect(chip("Star Battery").getByText("11:00:00")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
    });

    it("shows who is signed in once the player signs in with Google", async () => {
      const auth = createMemoryAuthService(() =>
        Promise.resolve({ uid: "1", displayName: "Ada Lovelace", email: "ada@example.com" }),
      );
      render(<App store={createMemoryDropStore()} auth={auth} now={() => NOW} />);

      await userEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Sign in with Google" })).toBeNull();
    });

    it("falls back to the email when the Google account has no display name", async () => {
      const auth = createMemoryAuthService(() =>
        Promise.resolve({ uid: "1", displayName: null, email: "ada@example.com" }),
      );
      render(<App store={createMemoryDropStore()} auth={auth} now={() => NOW} />);

      await userEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

      expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    });

    it("returns to signed out when the player signs out", async () => {
      const auth = createMemoryAuthService(() =>
        Promise.resolve({ uid: "1", displayName: "Ada Lovelace", email: "ada@example.com" }),
      );
      render(<App store={createMemoryDropStore()} auth={auth} now={() => NOW} />);
      await userEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

      await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

      expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
      expect(screen.queryByText("Ada Lovelace")).toBeNull();
    });

    it("does not sign out when the player clicks the account name", async () => {
      const auth = createMemoryAuthService(() =>
        Promise.resolve({ uid: "1", displayName: "Ada Lovelace", email: "ada@example.com" }),
      );
      render(<App store={createMemoryDropStore()} auth={auth} now={() => NOW} />);
      await userEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

      await userEvent.click(screen.getByText("Ada Lovelace"));

      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    });

    it("quietly returns to signed out when the sign-in popup is cancelled", async () => {
      const auth = createMemoryAuthService(() => Promise.reject(new Error("popup closed")));
      render(<App store={createMemoryDropStore()} auth={auth} now={() => NOW} />);

      await userEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

      expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      ).toBeEnabled();
    });

    it("keeps Ready dates in the local store while signed in", async () => {
      const store = createMemoryDropStore();
      const auth = createMemoryAuthService(() =>
        Promise.resolve({ uid: "1", displayName: "Ada Lovelace", email: "ada@example.com" }),
      );
      render(<App store={store} auth={auth} now={() => NOW} />);
      await userEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

      await userEvent.click(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      );

      expect(chip("Star Battery").getByText("11:00:00")).toBeInTheDocument();
      expect(store.get("gl-timer-star-battery")?.readyAt).toBe(NOW + 11 * 3600 * 1000);
    });
  });

  describe("auth restoring", () => {
    it("shows a loading state instead of a flash of empty timers while auth is restoring", () => {
      const auth = authServiceFrom({ status: "restoring" });
      const store = createMemoryDropStore({ "gl-timer-star-battery": NOW + 5000 });
      render(<App store={store} auth={auth} now={() => NOW} />);

      expect(screen.queryByRole("group", { name: "Star Battery timer" })).toBeNull();
      expect(screen.getByRole("status", { name: "Loading your timers" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Sign in with Google" })).toBeNull();
    });

    it("shows the real timers once restoring resolves to signed-out", () => {
      const auth = authServiceFrom({ status: "restoring" });
      const store = createMemoryDropStore({ "gl-timer-star-battery": NOW + 5000 });
      render(<App store={store} auth={auth} now={() => NOW} />);

      act(() => auth.setState({ status: "signed-out" }));

      expect(screen.getByRole("group", { name: "Star Battery timer" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
      expect(screen.queryByRole("status", { name: "Loading your timers" })).toBeNull();
    });

    it("shows the returning player's data as soon as restoring resolves to signed-in", () => {
      const auth = authServiceFrom({ status: "restoring" });
      const store = createMemoryDropStore({ "gl-timer-star-battery": NOW + 5000 });
      render(<App store={store} auth={auth} now={() => NOW} />);

      act(() =>
        auth.setState({
          status: "signed-in",
          user: { uid: "1", displayName: "Ada Lovelace", email: null },
        }),
      );

      expect(chip("Star Battery").getByText("00:00:05")).toBeInTheDocument();
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    });
  });

  describe("sync status indicator", () => {
    async function signIn(store: ReturnType<typeof fakeSyncedStore>) {
      const auth = createMemoryAuthService(() =>
        Promise.resolve({ uid: "1", displayName: "Ada Lovelace", email: null }),
      );
      render(<App store={store} auth={auth} now={() => NOW} />);
      await userEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    }

    it("shows no sync status indicator while signed out", () => {
      const store = fakeSyncedStore("pending");
      render(<App store={store} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      expect(screen.queryByRole("status", { name: /Sync|Offline|Sending/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Save now" })).toBeNull();
    });

    it("shows a synced indicator without Save now once signed in and fully synced", async () => {
      await signIn(fakeSyncedStore("synced"));

      expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save now" })).toBeNull();
    });

    it("indicates when a send is in progress, without Save now", async () => {
      await signIn(fakeSyncedStore("sending"));

      expect(screen.getByRole("status", { name: "Sending…" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save now" })).toBeNull();
    });

    it("tells when the next send happens while changes are waiting", async () => {
      await signIn(fakeSyncedStore("pending"));

      expect(screen.getByRole("status", { name: /^Not synced yet, next send at / })).toBeVisible();
      expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled();
    });

    it("indicates when the browser is offline", async () => {
      await signIn(fakeSyncedStore("offline"));

      expect(
        screen.getByRole("status", {
          name: "Offline, changes will be sent once you're back online",
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save now" })).toBeInTheDocument();
    });

    it("indicates when a send has failed, and follows the status as it changes", async () => {
      const store = fakeSyncedStore("synced");
      await signIn(store);
      expect(screen.queryByRole("status", { name: /Sync failed/ })).toBeNull();

      act(() => store.setSyncStatus("error"));

      expect(screen.getByRole("status", { name: /^Sync failed/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save now" })).toBeInTheDocument();
    });

    it("asks the store to send right away when the player presses Save now", async () => {
      const store = fakeSyncedStore("pending");
      await signIn(store);

      await userEvent.click(screen.getByRole("button", { name: "Save now" }));

      expect(store.saveNow).toHaveBeenCalledTimes(1);
    });
  });

  describe("clock jumps", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("shows Ready after the clock jumps past the Ready date", () => {
      let time = NOW;
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => time} />);
      act(() => screen.getByRole("button", { name: "Start Star Battery timer" }).click());
      expect(chip("Star Battery").getByText("11:00:00")).toBeInTheDocument();

      time = NOW + 12 * 3600 * 1000;
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(chip("Star Battery").getByText("Ready!")).toBeInTheDocument();
    });
  });

  describe("advanced settings modal", () => {
    it("opens the advanced card for a Drop and closes it with the close button", async () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await openAdvanced("Tool Case");
      expect(
        screen.getByRole("dialog", { name: "Advanced settings for Tool Case" }),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("closes when the player presses Escape", async () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await openAdvanced("Helmet");
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("shows only one Drop's advanced card at a time", async () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await openAdvanced("Star Battery");
      await openAdvanced("Helmet");

      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(
        screen.getByRole("dialog", { name: "Advanced settings for Helmet" }),
      ).toBeInTheDocument();
    });

    it("returns focus to the button that opened it once closed", async () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      const trigger = screen.getByRole("button", { name: "Advanced settings for Tool Case" });

      await userEvent.click(trigger);
      await userEvent.keyboard("{Escape}");

      expect(trigger).toHaveFocus();
    });

    it("keeps Tab focus inside the dialog", async () => {
      render(<App store={createMemoryDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await openAdvanced("Tool Case");
      const dialog = screen.getByRole("dialog");
      const buttons = within(dialog).getAllByRole("button");
      expect(document.activeElement).toBe(buttons[0]);

      await userEvent.tab({ shift: true });

      expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    });
  });

  describe("the chip stays in sync with the advanced card", () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it("updates the chip immediately when the Drop is relaunched from the advanced card", async () => {
      render(<App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await openAdvanced("Star Battery");
      await userEvent.click(card("Star Battery").getByRole("button", { name: "Start timer" }));

      expect(chip("Star Battery").getByText("11:00:00")).toBeInTheDocument();
    });

    it("updates the chip immediately when a manual Ready date is saved in the advanced card", async () => {
      render(<App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);

      await openAdvanced("Star Battery");
      await userEvent.click(
        card("Star Battery").getByRole("button", { name: "Set Star Battery Ready date manually" }),
      );
      const input = card("Star Battery").getByDisplayValue(/.*/) as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, "2026-01-01T18:30");
      await userEvent.click(card("Star Battery").getByRole("button", { name: "Save" }));

      expect(chip("Star Battery").getByText("06:30:00")).toBeInTheDocument();
    });

    it("updates the chip immediately when the Drop is reset from the advanced card", async () => {
      render(<App store={createLocalStorageDropStore()} auth={SIGNED_OUT_AUTH} now={() => NOW} />);
      await userEvent.click(
        chip("Star Battery").getByRole("button", { name: "Start Star Battery timer" }),
      );

      await openAdvanced("Star Battery");
      await userEvent.click(
        card("Star Battery").getByRole("button", { name: "Reset Star Battery timer" }),
      );
      await userEvent.click(card("Star Battery").getByRole("button", { name: "Reset" }));

      expect(chip("Star Battery").getByText("--:--:--")).toBeInTheDocument();
    });
  });
});
