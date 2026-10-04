import { describe, expect, it, vi } from "vitest";
import { createAuthStore, type AuthService } from "../auth/auth";
import { createAccountSync, type AccountSession } from "./accountSync";
import { createMemoryColonyStore, type ColonyEntry, type ColonyStore } from "./colonyStore";
import { createMemoryDropStore, type DropStore } from "./dropStore";
import type { SyncStatus, SyncStatusStore } from "./sendScheduler";
import { createMemorySettingsStore, type SettingsStore } from "./settingsStore";

function fakeRemoteStore(initial: Record<string, number> = {}) {
  const store = createMemoryDropStore(initial);
  let status: SyncStatus = "synced";
  const listeners = new Set<() => void>();
  const saveNow = vi.fn();
  const dispose = vi.fn();
  const syncStatus: SyncStatusStore = {
    getStatus: () => status,
    getNextSendAt: () => 123456,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    saveNow,
  };
  return {
    saveNow,
    dispose,
    store: Object.assign({}, store, { syncStatus, dispose }) as DropStore & {
      syncStatus: SyncStatusStore;
      dispose(): void;
    },
    setStatus(next: SyncStatus) {
      status = next;
      listeners.forEach((onChange) => onChange());
    },
  };
}

function authServiceFrom(store: ReturnType<typeof createAuthStore>): AuthService {
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    signIn: async () => {},
    signOut: async () => {},
  };
}

const IDLE_STATUS: SyncStatusStore = {
  getStatus: () => "synced",
  getNextSendAt: () => null,
  subscribe: () => () => {},
  saveNow: () => {},
};

type RemoteDropStore = DropStore & { syncStatus?: SyncStatusStore; dispose?: () => void };

function sessionOf(
  drops: RemoteDropStore,
  colonies: ColonyStore = createMemoryColonyStore(),
  settings: SettingsStore = createMemorySettingsStore(),
): AccountSession {
  return {
    drops,
    colonies,
    settings,
    syncStatus: drops.syncStatus ?? IDLE_STATUS,
    isLoaded: () => true,
    subscribeLoaded: () => () => {},
    dispose: () => drops.dispose?.(),
  };
}

function syncedDrops(deps: {
  auth: AuthService;
  localStore: DropStore;
  createRemoteStore: (uid: string) => RemoteDropStore;
  mergeLocalIntoRemote: (uid: string) => Promise<void>;
}) {
  return createAccountSync({
    auth: deps.auth,
    localDrops: deps.localStore,
    localColonies: createMemoryColonyStore(),
    localSettings: createMemorySettingsStore(),
    createSession: (uid) => sessionOf(deps.createRemoteStore(uid)),
    mergeLocalIntoAccount: deps.mergeLocalIntoRemote,
  }).drops;
}

function colony(starBaseLevel: number, updatedAt: number): ColonyEntry {
  return { starBaseLevel, buildings: {}, updatedAt };
}

const USER = { uid: "1", displayName: null, email: null };

async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createAccountSync drops", () => {
  it("uses the local store while signed out", () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore({ "drop-a": 1000 });
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => createMemoryDropStore(),
      mergeLocalIntoRemote: async () => {},
    });

    expect(store.get("drop-a")?.readyAt).toBe(1000);
    store.set("drop-a", 2000, 50);
    expect(localStore.get("drop-a")).toEqual({ readyAt: 2000, updatedAt: 50 });
  });

  it("keeps using the local store while the merge into the account is in flight", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore({ "drop-a": 1000 });
    const remoteStore = createMemoryDropStore();
    const merge = deferred<void>();
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: () => merge.promise,
    });

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });

    expect(store.get("drop-a")?.readyAt).toBe(1000);
    store.set("drop-a", 3000, 60);
    expect(remoteStore.get("drop-a")).toBeNull();
  });

  it("switches to the account store once the merge completes", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore({ "drop-a": 1000 });
    const remoteStore = createMemoryDropStore({ "drop-a": 4000 });
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: async () => {},
    });

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.get("drop-a")?.readyAt).toBe(4000);
    store.set("drop-a", 5000, 70);
    expect(remoteStore.get("drop-a")).toEqual({ readyAt: 5000, updatedAt: 70 });
  });

  it("also saves every change to the local store once switched to the account store", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore({ "drop-a": 1000 });
    const remoteStore = createMemoryDropStore();
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: async () => {},
    });
    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();

    store.set("drop-a", 5000, 70);

    expect(localStore.get("drop-a")).toEqual({ readyAt: 5000, updatedAt: 70 });
  });

  it("notifies existing subscribers when the backing store switches", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore();
    const remoteStore = createMemoryDropStore({ "drop-a": 9000 });
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: async () => {},
    });
    const onChange = vi.fn();
    store.subscribe("drop-a", onChange);

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(onChange).toHaveBeenCalled();
    expect(store.get("drop-a")?.readyAt).toBe(9000);
  });

  it("stops reacting to local store changes once switched to the account store", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore();
    const remoteStore = createMemoryDropStore();
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: async () => {},
    });
    const onChange = vi.fn();
    store.subscribe("drop-a", onChange);
    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();
    onChange.mockClear();

    localStore.set("drop-a", 1234, 1);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("reverts to the local store when signing out", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore({ "drop-a": 1000 });
    const remoteStore = createMemoryDropStore({ "drop-a": 9000 });
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: async () => {},
    });
    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.get("drop-a")?.readyAt).toBe(9000);

    authStore.setState({ status: "signed-out" });

    expect(store.get("drop-a")?.readyAt).toBe(1000);
  });

  it("does not tear down and rebuild subscriptions when auth re-fires signed-in for the same uid", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore();
    const remoteStore = createMemoryDropStore({ "drop-a": 9000 });
    const subscribeSpy = vi.spyOn(remoteStore, "subscribe");
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: async () => {},
    });
    const onChange = vi.fn();
    store.subscribe("drop-a", onChange);

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();
    subscribeSpy.mockClear();

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it("re-merges before switching when a write races the in-flight merge", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore({ "drop-a": 1000 });
    const remoteStore = createMemoryDropStore();
    let resolveFirstMerge!: () => void;
    const firstMergeGate = new Promise<void>((resolve) => (resolveFirstMerge = resolve));
    let mergeCalls = 0;
    const mergeLocalIntoRemote = async () => {
      mergeCalls += 1;
      if (mergeCalls === 1) await firstMergeGate;
      const local = localStore.get("drop-a");
      const remote = remoteStore.get("drop-a");
      if (!local) return;
      if (remote && remote.updatedAt >= local.updatedAt) return;
      remoteStore.set("drop-a", local.readyAt, local.updatedAt);
    };
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote,
    });

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    store.set("drop-a", 2000, 999);
    resolveFirstMerge();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mergeCalls).toBe(2);
    expect(store.get("drop-a")?.readyAt).toBe(2000);
  });

  it("does not get stuck on the local store when the merge rejects", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore({ "drop-a": 1000 });
    const remoteStore = createMemoryDropStore({ "drop-a": 9000 });
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: async () => {
        throw new Error("network error");
      },
    });

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.get("drop-a")?.readyAt).toBe(9000);
  });

  it("stays on the local store while auth is restoring", () => {
    const authStore = createAuthStore({ status: "restoring" });
    const localStore = createMemoryDropStore({ "drop-a": 1000 });
    const remoteStore = createMemoryDropStore({ "drop-a": 9000 });
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: async () => {},
    });

    expect(store.get("drop-a")?.readyAt).toBe(1000);
  });

  it("switches to the account store once restoring resolves to signed-in", async () => {
    const authStore = createAuthStore({ status: "restoring" });
    const localStore = createMemoryDropStore({ "drop-a": 1000 });
    const remoteStore = createMemoryDropStore({ "drop-a": 9000 });
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: async () => {},
    });

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.get("drop-a")?.readyAt).toBe(9000);
  });

  it("ignores a stale merge result when the user signs out before it resolves", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const localStore = createMemoryDropStore({ "drop-a": 1000 });
    const remoteStore = createMemoryDropStore({ "drop-a": 9000 });
    const merge = deferred<void>();
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore,
      createRemoteStore: () => remoteStore,
      mergeLocalIntoRemote: () => merge.promise,
    });

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    authStore.setState({ status: "signed-out" });
    merge.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.get("drop-a")?.readyAt).toBe(1000);
  });
});

describe("createAccountSync sync status", () => {
  it("reports no sync status while signed out", () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const remote = fakeRemoteStore();
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore: createMemoryDropStore(),
      createRemoteStore: () => remote.store,
      mergeLocalIntoRemote: async () => {},
    });

    expect(store.getSyncStatus()).toBeNull();
  });

  it("forwards the remote store's sync status once switched over", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const remote = fakeRemoteStore();
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore: createMemoryDropStore(),
      createRemoteStore: () => remote.store,
      mergeLocalIntoRemote: async () => {},
    });

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getSyncStatus()).toBe("synced");
    expect(store.getNextSendAt()).toBe(123456);
    remote.setStatus("sending");
    expect(store.getSyncStatus()).toBe("sending");
  });

  it("notifies sync status subscribers when the remote status changes", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const remote = fakeRemoteStore();
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore: createMemoryDropStore(),
      createRemoteStore: () => remote.store,
      mergeLocalIntoRemote: async () => {},
    });
    const onChange = vi.fn();
    store.subscribeSyncStatus(onChange);

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();
    onChange.mockClear();

    remote.setStatus("error");

    expect(onChange).toHaveBeenCalled();
  });

  it("reverts to no sync status on sign-out and stops reacting to the old remote status", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const remote = fakeRemoteStore();
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore: createMemoryDropStore(),
      createRemoteStore: () => remote.store,
      mergeLocalIntoRemote: async () => {},
    });
    const onChange = vi.fn();
    store.subscribeSyncStatus(onChange);

    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();

    authStore.setState({ status: "signed-out" });
    expect(store.getSyncStatus()).toBeNull();

    onChange.mockClear();
    remote.setStatus("error");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("forwards Save now to the account store", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const remote = fakeRemoteStore();
    const store = syncedDrops({
      auth: authServiceFrom(authStore),
      localStore: createMemoryDropStore(),
      createRemoteStore: () => remote.store,
      mergeLocalIntoRemote: async () => {},
    });
    authStore.setState({
      status: "signed-in",
      user: { uid: "1", displayName: null, email: null },
    });
    await Promise.resolve();
    await Promise.resolve();

    store.saveNow();

    expect(remote.saveNow).toHaveBeenCalledTimes(1);
  });

  it("disposes the account store on sign-out and builds a fresh one on the next sign-in", async () => {
    const authStore = createAuthStore({ status: "signed-out" });
    const remote = fakeRemoteStore();
    const createRemoteStore = vi.fn(() => remote.store);
    syncedDrops({
      auth: authServiceFrom(authStore),
      localStore: createMemoryDropStore(),
      createRemoteStore,
      mergeLocalIntoRemote: async () => {},
    });
    const user = { uid: "1", displayName: null, email: null };
    authStore.setState({ status: "signed-in", user });
    await Promise.resolve();
    await Promise.resolve();

    authStore.setState({ status: "signed-out" });
    expect(remote.dispose).toHaveBeenCalledTimes(1);

    authStore.setState({ status: "signed-in", user });
    await Promise.resolve();
    await Promise.resolve();
    expect(createRemoteStore).toHaveBeenCalledTimes(2);
  });
});

describe("createAccountSync colonies", () => {
  function setup(mergeLocalIntoAccount: (uid: string) => Promise<void> = async () => {}) {
    const authStore = createAuthStore({ status: "signed-out" });
    const localColonies = createMemoryColonyStore();
    const remoteColonies = createMemoryColonyStore();
    const sync = createAccountSync({
      auth: authServiceFrom(authStore),
      localDrops: createMemoryDropStore(),
      localColonies,
      localSettings: createMemorySettingsStore(),
      createSession: () => sessionOf(createMemoryDropStore(), remoteColonies),
      mergeLocalIntoAccount,
    });
    return { authStore, localColonies, remoteColonies, colonies: sync.colonies };
  }

  it("keeps Colonies local for a visitor without an account", () => {
    const { localColonies, colonies } = setup();

    colonies.set("main", colony(3, 10));

    expect(localColonies.get("main")).toEqual(colony(3, 10));
    expect(colonies.get("main")).toEqual(colony(3, 10));
  });

  it("switches Colonies to the account once the merge completes", async () => {
    const { authStore, localColonies, remoteColonies, colonies } = setup();
    localColonies.set("main", colony(2, 10));
    remoteColonies.set("main", colony(6, 20));

    authStore.setState({ status: "signed-in", user: USER });
    await settle();

    expect(colonies.get("main")).toEqual(colony(6, 20));
  });

  it("sends Colony changes to the account and keeps a local copy once signed in", async () => {
    const { authStore, localColonies, remoteColonies, colonies } = setup();
    authStore.setState({ status: "signed-in", user: USER });
    await settle();

    colonies.set("colony-1", colony(4, 30));

    expect(remoteColonies.get("colony-1")).toEqual(colony(4, 30));
    expect(localColonies.get("colony-1")).toEqual(colony(4, 30));
  });

  it("notifies Colony subscribers when the account store takes over", async () => {
    const { authStore, remoteColonies, colonies } = setup();
    remoteColonies.set("main", colony(6, 20));
    const onChange = vi.fn();
    colonies.subscribe("main", onChange);

    authStore.setState({ status: "signed-in", user: USER });
    await settle();

    expect(onChange).toHaveBeenCalled();
  });

  it("re-merges before switching when a Colony edit races the in-flight merge", async () => {
    const merge = deferred<void>();
    let mergeCalls = 0;
    const { authStore, colonies } = setup(async () => {
      mergeCalls += 1;
      if (mergeCalls === 1) await merge.promise;
    });

    authStore.setState({ status: "signed-in", user: USER });
    colonies.set("main", colony(5, 40));
    merge.resolve();
    await settle();

    expect(mergeCalls).toBe(2);
  });

  it("reverts Colonies to the local store when signing out", async () => {
    const { authStore, localColonies, remoteColonies, colonies } = setup();
    localColonies.set("main", colony(2, 10));
    remoteColonies.set("main", colony(6, 20));
    authStore.setState({ status: "signed-in", user: USER });
    await settle();

    authStore.setState({ status: "signed-out" });

    expect(colonies.get("main")).toEqual(colony(2, 10));
  });
});

describe("createAccountSync settings", () => {
  const SETTINGS = {
    onlyToUpgrade: true,
    hideWallUpgrades: false,
    prioritizeBanksAndSilos: false,
    updatedAt: 10,
  };
  const ACCOUNT_SETTINGS = {
    onlyToUpgrade: false,
    hideWallUpgrades: true,
    prioritizeBanksAndSilos: false,
    updatedAt: 20,
  };

  function setup() {
    const authStore = createAuthStore({ status: "signed-out" });
    const localSettings = createMemorySettingsStore();
    const remoteSettings = createMemorySettingsStore();
    const sync = createAccountSync({
      auth: authServiceFrom(authStore),
      localDrops: createMemoryDropStore(),
      localColonies: createMemoryColonyStore(),
      localSettings,
      createSession: () =>
        sessionOf(createMemoryDropStore(), createMemoryColonyStore(), remoteSettings),
      mergeLocalIntoAccount: async () => {},
    });
    return { authStore, localSettings, remoteSettings, settings: sync.settings };
  }

  it("keeps the settings local for a visitor without an account", () => {
    const { localSettings, settings } = setup();

    settings.set("planner", SETTINGS);

    expect(localSettings.get("planner")).toEqual(SETTINGS);
  });

  it("switches the settings to the account once signed in and sends changes there", async () => {
    const { authStore, localSettings, remoteSettings, settings } = setup();
    localSettings.set("planner", SETTINGS);
    remoteSettings.set("planner", ACCOUNT_SETTINGS);

    authStore.setState({ status: "signed-in", user: USER });
    await settle();

    expect(settings.get("planner")).toEqual(ACCOUNT_SETTINGS);
    settings.set("planner", { ...SETTINGS, updatedAt: 30 });
    expect(remoteSettings.get("planner")).toEqual({ ...SETTINGS, updatedAt: 30 });
    expect(localSettings.get("planner")).toEqual({ ...SETTINGS, updatedAt: 30 });
  });
});

describe("createAccountSync loading", () => {
  function loadingSession() {
    let loaded = false;
    const listeners = new Set<() => void>();
    const session: AccountSession = {
      ...sessionOf(createMemoryDropStore()),
      isLoaded: () => loaded,
      subscribeLoaded(onChange) {
        listeners.add(onChange);
        return () => listeners.delete(onChange);
      },
    };
    return {
      session,
      finishLoading() {
        loaded = true;
        listeners.forEach((onChange) => onChange());
      },
    };
  }

  function syncWith(
    authStore: ReturnType<typeof createAuthStore>,
    session: AccountSession,
    mergeLocalIntoAccount: () => Promise<void> = async () => {},
  ) {
    return createAccountSync({
      auth: authServiceFrom(authStore),
      localDrops: createMemoryDropStore(),
      localColonies: createMemoryColonyStore(),
      localSettings: createMemorySettingsStore(),
      createSession: () => session,
      mergeLocalIntoAccount,
    });
  }

  it("is not loading for a visitor without an account", () => {
    const sync = syncWith(createAuthStore({ status: "signed-out" }), loadingSession().session);

    expect(sync.loading.isLoading()).toBe(false);
  });

  it("is loading while auth is restoring", () => {
    const sync = syncWith(createAuthStore({ status: "restoring" }), loadingSession().session);

    expect(sync.loading.isLoading()).toBe(true);
  });

  it("stays loading while the merge into the account is in flight", async () => {
    const authStore = createAuthStore({ status: "restoring" });
    const { session, finishLoading } = loadingSession();
    finishLoading();
    const merge = deferred<void>();
    const sync = syncWith(authStore, session, () => merge.promise);

    authStore.setState({ status: "signed-in", user: USER });
    await settle();

    expect(sync.loading.isLoading()).toBe(true);
  });

  it("stays loading until the account has delivered its data, then notifies", async () => {
    const authStore = createAuthStore({ status: "restoring" });
    const { session, finishLoading } = loadingSession();
    const sync = syncWith(authStore, session);
    const onChange = vi.fn();
    sync.loading.subscribe(onChange);

    authStore.setState({ status: "signed-in", user: USER });
    await settle();
    expect(sync.loading.isLoading()).toBe(true);

    finishLoading();

    expect(sync.loading.isLoading()).toBe(false);
    expect(onChange).toHaveBeenCalled();
  });

  it("stops loading and notifies when restoring resolves to signed out", () => {
    const authStore = createAuthStore({ status: "restoring" });
    const sync = syncWith(authStore, loadingSession().session);
    const onChange = vi.fn();
    sync.loading.subscribe(onChange);

    authStore.setState({ status: "signed-out" });

    expect(sync.loading.isLoading()).toBe(false);
    expect(onChange).toHaveBeenCalled();
  });

  it("stops following the account loading once signed out", async () => {
    const authStore = createAuthStore({ status: "signed-in", user: USER });
    const { session, finishLoading } = loadingSession();
    const sync = syncWith(authStore, session);
    await settle();

    authStore.setState({ status: "signed-out" });
    const onChange = vi.fn();
    sync.loading.subscribe(onChange);
    finishLoading();

    expect(sync.loading.isLoading()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});
