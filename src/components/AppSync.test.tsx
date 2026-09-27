import { fireEvent, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createAuthStore, type AuthService, type AuthState } from "../auth/auth";
import { createFirestoreAccountSync } from "../store/accountSync";
import { createMemoryColonyStore, type ColonyStore } from "../store/colonyStore";
import { createMemoryDropStore, type DropStore } from "../store/dropStore";
import { createMemorySettingsStore } from "../store/settingsStore";

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  onSnapshot: vi.fn(() => vi.fn()),
  setDoc: vi.fn(() => Promise.resolve()),
  getDoc: vi.fn(() => Promise.resolve({ data: () => undefined })),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
}));

const NOW = new Date("2026-01-01T12:00:00").getTime();
const FIVE_MINUTES = 5 * 60 * 1000;
const FAKE_DB = {} as never;
const STAR_BATTERY = "gl-timer-star-battery";
const TOOL_CASE = "gl-timer-tool-case";
const SIGNED_IN: AuthState = {
  status: "signed-in",
  user: { uid: "player-1", displayName: "Ada Lovelace", email: null },
};

type Handler = (snapshot: { data: () => unknown }) => void;

let snapshotHandlers: Map<string, Handler>;

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

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function chip(name: string) {
  return within(screen.getByRole("group", { name: `${name} timer` }));
}

function tick(ms: number) {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function collect(name: string) {
  act(() =>
    chip(name)
      .getByRole("button", { name: `Start ${name} timer` })
      .click(),
  );
}

function resetDrop(name: string) {
  const dialogQueries = () => within(screen.getByRole("dialog"));
  act(() => screen.getByRole("button", { name: `Advanced settings for ${name}` }).click());
  act(() =>
    dialogQueries()
      .getByRole("button", { name: `Reset ${name} timer` })
      .click(),
  );
  act(() => dialogQueries().getByRole("button", { name: "Reset" }).click());
  act(() => screen.getByRole("button", { name: "Close" }).click());
}

function saveNowButton() {
  return screen.queryByRole("button", { name: "Save now" });
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

let auth: ReturnType<typeof authServiceFrom>;
let localStore: DropStore;
let localColonies: ColonyStore;

async function renderSignedIn() {
  auth = authServiceFrom(SIGNED_IN);
  localStore = createMemoryDropStore();
  localColonies = createMemoryColonyStore();
  const sync = createFirestoreAccountSync({
    auth,
    localDrops: localStore,
    localColonies,
    localSettings: createMemorySettingsStore(),
    db: FAKE_DB,
    dropKeys: [STAR_BATTERY, TOOL_CASE],
    colonyIds: ["main"],
    settingsKeys: ["planner"],
  });
  await tick(0);
  render(
    <App
      store={sync.drops}
      auth={auth}
      now={() => NOW}
      colonyStore={sync.colonies}
      settingsStore={sync.settings}
    />,
  );
  return sync;
}

function setStarBaseLevel(level: number) {
  act(() =>
    fireEvent.change(screen.getByRole("combobox", { name: "Star Base level" }), {
      target: { value: String(level) },
    }),
  );
}

describe("deferred sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    snapshotHandlers = new Map();
    vi.mocked(setDoc).mockReset().mockResolvedValue(undefined);
    vi.mocked(onSnapshot).mockReset();
    vi.mocked(onSnapshot).mockImplementation(((ref: { path: string }, onNext: Handler) => {
      snapshotHandlers.set(ref.path, onNext);
      return vi.fn();
    }) as never);
    vi.mocked(doc).mockClear();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    setVisibility("visible");
  });

  afterEach(() => {
    act(() => auth.setState({ status: "signed-out" }));
    vi.useRealTimers();
  });

  it("shows a green dot when nothing is waiting to be sent", async () => {
    await renderSignedIn();

    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
    expect(saveNowButton()).toBeNull();
  });

  it("saves a change locally at once and sends nothing before five minutes", async () => {
    await renderSignedIn();

    collect("Star Battery");
    await tick(FIVE_MINUTES - 1000);

    expect(localStore.get(STAR_BATTERY)?.updatedAt).toBe(NOW);
    expect(chip("Star Battery").getByText("11:00:00")).toBeInTheDocument();
    expect(setDoc).not.toHaveBeenCalled();
    expect(
      screen.getByRole("status", { name: /Not synced yet, next send at/ }),
    ).toBeInTheDocument();
  });

  it("sends the change once five minutes have passed, then turns green", async () => {
    await renderSignedIn();
    collect("Star Battery");

    await tick(FIVE_MINUTES);

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledWith(
      { path: `users/player-1/drops/${STAR_BATTERY}` },
      { readyAt: NOW + 11 * 3600 * 1000, updatedAt: NOW },
    );
    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
  });

  it("sends a burst of changes as one send holding the latest value of each Drop", async () => {
    await renderSignedIn();

    collect("Star Battery");
    collect("Tool Case");
    resetDrop("Star Battery");
    await tick(FIVE_MINUTES);

    expect(setDoc).toHaveBeenCalledTimes(2);
    const sent = new Map(
      vi.mocked(setDoc).mock.calls.map(([ref, data]) => [(ref as { path: string }).path, data]),
    );
    expect(sent.get(`users/player-1/drops/${STAR_BATTERY}`)).toEqual({
      readyAt: null,
      updatedAt: NOW,
    });
    expect(sent.get(`users/player-1/drops/${TOOL_CASE}`)).toMatchObject({ updatedAt: NOW });
  });

  it("sends at most every five minutes even when the player keeps editing", async () => {
    await renderSignedIn();
    collect("Star Battery");
    await tick(FIVE_MINUTES - 60 * 1000);
    collect("Tool Case");
    await tick(60 * 1000);

    expect(setDoc).toHaveBeenCalledTimes(2);
    await tick(FIVE_MINUTES);
    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it("sends immediately with Save now, showing yellow while sending", async () => {
    const write = deferred();
    vi.mocked(setDoc).mockReturnValueOnce(write.promise);
    await renderSignedIn();
    collect("Star Battery");

    await act(async () => screen.getByRole("button", { name: "Save now" }).click());

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status", { name: "Sending…" })).toBeInTheDocument();
    expect(saveNowButton()).toBeNull();

    await act(async () => write.resolve());

    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
    expect(saveNowButton()).toBeNull();
  });

  it("sends pending changes when the tab goes to the background", async () => {
    await renderSignedIn();
    collect("Star Battery");

    await act(async () => setVisibility("hidden"));

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("sends pending changes when the page is closed", async () => {
    await renderSignedIn();
    collect("Star Battery");

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("holds changes made offline behind a red dot and sends them once back online", async () => {
    await renderSignedIn();
    act(() => setOnline(false));
    collect("Star Battery");

    await tick(FIVE_MINUTES);

    expect(setDoc).not.toHaveBeenCalled();
    expect(
      screen.getByRole("status", { name: "Offline, changes will be sent once you're back online" }),
    ).toBeInTheDocument();

    await act(async () => setOnline(true));

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
  });

  it("turns red with the failure when a send fails and retries at the next interval", async () => {
    vi.mocked(setDoc).mockRejectedValueOnce({ code: "permission-denied" });
    await renderSignedIn();
    collect("Star Battery");

    await tick(FIVE_MINUTES);

    expect(screen.getByRole("status", { name: /Sync failed/ })).toBeInTheDocument();
    expect(saveNowButton()).toBeInTheDocument();

    await tick(FIVE_MINUTES);

    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
  });

  it("turns red instead of staying yellow forever when a send never gets acknowledged", async () => {
    vi.mocked(setDoc).mockReturnValueOnce(new Promise<void>(() => {}));
    await renderSignedIn();
    collect("Star Battery");
    await tick(FIVE_MINUTES);
    expect(screen.getByRole("status", { name: "Sending…" })).toBeInTheDocument();

    await tick(30 * 1000);

    expect(screen.getByRole("status", { name: /Sync failed/ })).toBeInTheDocument();
    await tick(FIVE_MINUTES);
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
  });

  it("does not lose an edit made while a send is in flight", async () => {
    const write = deferred();
    vi.mocked(setDoc).mockReturnValueOnce(write.promise);
    await renderSignedIn();
    collect("Star Battery");
    await tick(FIVE_MINUTES);

    collect("Tool Case");
    await act(async () => write.resolve());

    expect(screen.getByRole("status", { name: /Not synced yet/ })).toBeInTheDocument();

    await tick(FIVE_MINUTES);

    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(vi.mocked(setDoc).mock.calls[1][0]).toEqual({
      path: `users/player-1/drops/${TOOL_CASE}`,
    });
    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
  });

  it("sends an edit made during a send right after it when the tab goes to the background", async () => {
    const write = deferred();
    vi.mocked(setDoc).mockReturnValueOnce(write.promise);
    await renderSignedIn();
    collect("Star Battery");
    await tick(FIVE_MINUTES);
    collect("Tool Case");

    await act(async () => setVisibility("hidden"));
    expect(setDoc).toHaveBeenCalledTimes(1);
    await act(async () => write.resolve());

    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it("keeps a pending edit visible when an older snapshot arrives from the listener", async () => {
    await renderSignedIn();
    collect("Star Battery");

    act(() =>
      snapshotHandlers.get(`users/player-1/drops/${STAR_BATTERY}`)?.({
        data: () => ({ readyAt: NOW - 1000, updatedAt: NOW - 10_000 }),
      }),
    );

    expect(chip("Star Battery").queryByText("Ready!")).toBeNull();
    await tick(FIVE_MINUTES);
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("shows a newer edit from another device and drops the older pending one", async () => {
    await renderSignedIn();
    collect("Star Battery");

    act(() =>
      snapshotHandlers.get(`users/player-1/drops/${STAR_BATTERY}`)?.({
        data: () => ({ readyAt: NOW + 3600 * 1000, updatedAt: NOW + 5000 }),
      }),
    );

    expect(chip("Star Battery").getByText("01:00:00")).toBeInTheDocument();
    await tick(FIVE_MINUTES);
    expect(setDoc).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
  });

  it("stamps the edit with the time of the edit, not of the send", async () => {
    await renderSignedIn();
    collect("Star Battery");

    await tick(FIVE_MINUTES);

    expect(vi.mocked(setDoc).mock.calls[0][1]).toMatchObject({ updatedAt: NOW });
  });

  it("holds a Colony change behind the status dot and sends it with Save now", async () => {
    await renderSignedIn();
    setStarBaseLevel(3);

    expect(localColonies.get("main")).toMatchObject({ starBaseLevel: 3, updatedAt: NOW });
    expect(setDoc).not.toHaveBeenCalled();
    expect(
      screen.getByRole("status", { name: /Not synced yet, next send at/ }),
    ).toBeInTheDocument();

    await act(async () => screen.getByRole("button", { name: "Save now" }).click());

    expect(setDoc).toHaveBeenCalledWith(
      { path: "users/player-1/colonies/main" },
      { starBase: 3, buildings: {}, updatedAt: NOW },
    );
    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
  });

  it("sends Drop and Colony changes together in the same deferred send", async () => {
    await renderSignedIn();
    collect("Star Battery");
    setStarBaseLevel(2);

    await tick(FIVE_MINUTES);

    const paths = vi.mocked(setDoc).mock.calls.map(([ref]) => (ref as { path: string }).path);
    expect(paths).toEqual(
      expect.arrayContaining([
        `users/player-1/drops/${STAR_BATTERY}`,
        "users/player-1/colonies/main",
      ]),
    );
  });

  it("sends the Planner options to the account with the deferred send", async () => {
    await renderSignedIn();
    act(() => screen.getByRole("checkbox", { name: "Only what to upgrade" }).click());
    act(() => screen.getByRole("checkbox", { name: "Hide wall upgrades" }).click());

    await tick(FIVE_MINUTES);

    expect(setDoc).toHaveBeenCalledWith(
      { path: "users/player-1/settings/planner" },
      { onlyToUpgrade: true, hideWallUpgrades: true, updatedAt: NOW },
    );
  });

  it("shows Planner options changed on another device", async () => {
    await renderSignedIn();

    act(() =>
      snapshotHandlers.get("users/player-1/settings/planner")?.({
        data: () => ({ onlyToUpgrade: true, hideWallUpgrades: true, updatedAt: NOW + 5000 }),
      }),
    );

    expect(screen.getByRole("checkbox", { name: "Only what to upgrade" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Hide wall upgrades" })).toBeChecked();
  });

  it("shows a Colony edited on another device through the real-time listener", async () => {
    await renderSignedIn();

    act(() =>
      snapshotHandlers.get("users/player-1/colonies/main")?.({
        data: () => ({ starBase: 7, buildings: {}, updatedAt: NOW + 5000 }),
      }),
    );

    expect(screen.getByRole("combobox", { name: "Star Base level" })).toHaveValue("7");
  });

  it("sends a started Construction with the Colony in the deferred send", async () => {
    await renderSignedIn();
    act(() => screen.getAllByRole("button", { name: /^Start (Build|Upgrade) / })[0].click());

    await tick(FIVE_MINUTES);

    expect(setDoc).toHaveBeenCalledWith(
      { path: "users/player-1/colonies/main" },
      expect.objectContaining({
        constructions: [
          expect.objectContaining({ finishAt: expect.any(Number), typeId: expect.any(String) }),
        ],
      }),
    );
  });

  it("shows a Construction started on another device at the top of the Next steps", async () => {
    await renderSignedIn();

    act(() =>
      snapshotHandlers.get("users/player-1/colonies/main")?.({
        data: () => ({
          starBase: 1,
          buildings: {},
          constructions: [
            {
              kind: "build",
              typeId: "starport",
              instance: 1,
              count: 1,
              targetLevel: 1,
              finishAt: NOW + 3600 * 1000,
            },
          ],
          updatedAt: NOW + 5000,
        }),
      }),
    );

    const [first] = within(screen.getByRole("list", { name: "Next steps" })).getAllByRole(
      "listitem",
    );
    expect(first).toHaveTextContent("01:00:00");
    expect(within(first).getByRole("button", { name: /^Cancel / })).toBeInTheDocument();
  });

  it("keeps a newer local Colony edit over an older one from the listener", async () => {
    await renderSignedIn();
    setStarBaseLevel(4);

    act(() =>
      snapshotHandlers.get("users/player-1/colonies/main")?.({
        data: () => ({ starBase: 9, buildings: {}, updatedAt: NOW - 5000 }),
      }),
    );

    expect(screen.getByRole("combobox", { name: "Star Base level" })).toHaveValue("4");
    await tick(FIVE_MINUTES);
    expect(setDoc).toHaveBeenCalledWith(
      { path: "users/player-1/colonies/main" },
      expect.objectContaining({ starBase: 4 }),
    );
  });
});
