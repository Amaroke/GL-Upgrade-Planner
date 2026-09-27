import type { Firestore } from "firebase/firestore";
import type { AuthService } from "../auth/auth";
import type { ColonyStore } from "./colonyStore";
import type { DropStore } from "./dropStore";
import { COLONY_CODEC, createFirestoreColonyStore } from "./firestoreColonyStore";
import { mergeLocalIntoCollection } from "./firestoreDocumentStore";
import { createFirestoreDropStore, DROP_CODEC } from "./firestoreDropStore";
import { createFirestoreSettingsStore, SETTINGS_CODEC } from "./firestoreSettingsStore";
import { createNotifier } from "./pubSub";
import { createSendScheduler, type SyncStatus, type SyncStatusStore } from "./sendScheduler";
import type { SettingsStore } from "./settingsStore";

type KeyedStore = {
  get(key: string): unknown;
  set(key: string, ...rest: never[]): void;
  subscribe(key: string, onChange: () => void): () => void;
};

type KeySubscription = {
  onChange: () => void;
  unsubscribe: () => void;
};

export type AccountSession = {
  drops: DropStore;
  colonies: ColonyStore;
  settings: SettingsStore;
  syncStatus: SyncStatusStore;
  isLoaded(): boolean;
  subscribeLoaded(onChange: () => void): () => void;
  dispose(): void;
};

export type LoadingStore = {
  isLoading(): boolean;
  subscribe(onChange: () => void): () => void;
};

export type SyncedDropStore = DropStore & {
  getSyncStatus(): SyncStatus | null;
  getNextSendAt(): number | null;
  subscribeSyncStatus(onChange: () => void): () => void;
  saveNow(): void;
};

export type AccountSync = {
  drops: SyncedDropStore;
  colonies: ColonyStore;
  settings: SettingsStore;
  loading: LoadingStore;
};

function createSwitchingStore<S extends KeyedStore>(local: S, onWrite: () => void) {
  const subscriptions = new Map<string, Set<KeySubscription>>();
  let backing: S = local;

  const store = {
    get: (key: string) => backing.get(key),
    set(...args: Parameters<S["set"]>) {
      const write = (target: S) => (target.set as (...values: unknown[]) => void)(...args);
      write(backing);
      if (backing !== local) write(local);
      onWrite();
    },
    subscribe(key: string, onChange: () => void) {
      const sub: KeySubscription = { onChange, unsubscribe: backing.subscribe(key, onChange) };
      const set = subscriptions.get(key) ?? new Set<KeySubscription>();
      set.add(sub);
      subscriptions.set(key, set);
      return () => {
        sub.unsubscribe();
        set.delete(sub);
      };
    },
  } as unknown as S;

  function switchTo(next: S) {
    if (next === backing) return;
    backing = next;
    subscriptions.forEach((subs, key) => {
      subs.forEach((sub) => {
        sub.unsubscribe();
        sub.unsubscribe = backing.subscribe(key, sub.onChange);
        sub.onChange();
      });
    });
  }

  return { store, switchTo };
}

export function createAccountSync(deps: {
  auth: AuthService;
  localDrops: DropStore;
  localColonies: ColonyStore;
  localSettings: SettingsStore;
  createSession: (uid: string) => AccountSession;
  mergeLocalIntoAccount: (uid: string) => Promise<void>;
}): AccountSync {
  const sessions = new Map<string, AccountSession>();
  const syncStatusNotifier = createNotifier();
  const loadingNotifier = createNotifier();
  let session: AccountSession | null = null;
  let unwatchSyncStatus: (() => void) | null = null;
  let unwatchLoaded: (() => void) | null = null;
  let generation = 0;
  let mergingGeneration: number | null = null;
  let wroteDuringMerge = false;

  const noteWrite = () => {
    if (mergingGeneration === generation) wroteDuringMerge = true;
  };
  const drops = createSwitchingStore(deps.localDrops, noteWrite);
  const colonies = createSwitchingStore(deps.localColonies, noteWrite);
  const settings = createSwitchingStore(deps.localSettings, noteWrite);

  function sessionFor(uid: string): AccountSession {
    let existing = sessions.get(uid);
    if (!existing) {
      existing = deps.createSession(uid);
      sessions.set(uid, existing);
    }
    return existing;
  }

  function activate(next: AccountSession | null) {
    if (next === session) return;
    session = next;
    unwatchSyncStatus?.();
    unwatchSyncStatus = next ? next.syncStatus.subscribe(syncStatusNotifier.notify) : null;
    unwatchLoaded?.();
    unwatchLoaded = next ? next.subscribeLoaded(loadingNotifier.notify) : null;
    drops.switchTo(next?.drops ?? deps.localDrops);
    colonies.switchTo(next?.colonies ?? deps.localColonies);
    settings.switchTo(next?.settings ?? deps.localSettings);
    syncStatusNotifier.notify();
    loadingNotifier.notify();
  }

  function isLoading(): boolean {
    const state = deps.auth.getState();
    if (state.status === "restoring") return true;
    if (state.status !== "signed-in") return false;
    return !(session && session === sessions.get(state.user.uid) && session.isLoaded());
  }

  async function activateForUid(uid: string, myGeneration: number) {
    let needsAnotherPass = true;
    while (needsAnotherPass) {
      needsAnotherPass = false;
      wroteDuringMerge = false;
      mergingGeneration = myGeneration;
      try {
        await deps.mergeLocalIntoAccount(uid);
      } catch {
      } finally {
        mergingGeneration = null;
      }
      if (myGeneration !== generation) return;
      if (wroteDuringMerge) needsAnotherPass = true;
    }
    activate(sessionFor(uid));
  }

  function handleAuthChange() {
    generation += 1;
    const state = deps.auth.getState();
    if (state.status === "signed-in") {
      void activateForUid(state.user.uid, generation);
    } else if (state.status !== "restoring") {
      activate(null);
      sessions.forEach((existing) => existing.dispose());
      sessions.clear();
    }
    loadingNotifier.notify();
  }

  handleAuthChange();
  deps.auth.subscribe(handleAuthChange);

  return {
    drops: {
      ...drops.store,
      getSyncStatus: () => session?.syncStatus.getStatus() ?? null,
      getNextSendAt: () => session?.syncStatus.getNextSendAt() ?? null,
      subscribeSyncStatus: syncStatusNotifier.subscribe,
      saveNow: () => session?.syncStatus.saveNow(),
    },
    colonies: colonies.store,
    settings: settings.store,
    loading: { isLoading, subscribe: loadingNotifier.subscribe },
  };
}

export async function mergeLocalIntoAccount(
  db: Firestore,
  uid: string,
  local: {
    drops: DropStore;
    colonies: ColonyStore;
    settings: SettingsStore;
    dropKeys: readonly string[];
    colonyIds: readonly string[];
    settingsKeys: readonly string[];
  },
): Promise<void> {
  await Promise.all([
    mergeLocalIntoCollection(
      db,
      uid,
      "drops",
      DROP_CODEC,
      (key) => local.drops.get(key),
      local.dropKeys,
    ),
    mergeLocalIntoCollection(
      db,
      uid,
      "colonies",
      COLONY_CODEC,
      (key) => local.colonies.get(key),
      local.colonyIds,
    ),
    mergeLocalIntoCollection(
      db,
      uid,
      "settings",
      SETTINGS_CODEC,
      (key) => local.settings.get(key),
      local.settingsKeys,
    ),
  ]);
}

type SessionKeys = {
  dropKeys: readonly string[];
  colonyIds: readonly string[];
  settingsKeys: readonly string[];
};

function createFirestoreSession(db: Firestore, uid: string, keys: SessionKeys): AccountSession {
  const scheduler = createSendScheduler();
  const drops = createFirestoreDropStore(db, uid, scheduler);
  const colonies = createFirestoreColonyStore(db, uid, scheduler);
  const settings = createFirestoreSettingsStore(db, uid, scheduler);
  const watched = [
    { store: drops, keys: keys.dropKeys },
    { store: colonies, keys: keys.colonyIds },
    { store: settings, keys: keys.settingsKeys },
  ];
  return {
    drops,
    colonies,
    settings,
    syncStatus: scheduler.syncStatus,
    isLoaded: () => watched.every(({ store, keys }) => keys.every((key) => store.isLoaded(key))),
    subscribeLoaded(onChange) {
      const unsubscribes = watched.flatMap(({ store, keys }) =>
        keys.map((key) => store.subscribe(key, onChange)),
      );
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    dispose() {
      drops.dispose();
      colonies.dispose();
      settings.dispose();
    },
  };
}

export function createFirestoreAccountSync(options: {
  auth: AuthService;
  localDrops: DropStore;
  localColonies: ColonyStore;
  localSettings: SettingsStore;
  db: Firestore;
  dropKeys: readonly string[];
  colonyIds: readonly string[];
  settingsKeys: readonly string[];
}): AccountSync {
  const { auth, localDrops, localColonies, localSettings, db } = options;
  return createAccountSync({
    auth,
    localDrops,
    localColonies,
    localSettings,
    createSession: (uid) => createFirestoreSession(db, uid, options),
    mergeLocalIntoAccount: (uid) =>
      mergeLocalIntoAccount(db, uid, {
        drops: localDrops,
        colonies: localColonies,
        settings: localSettings,
        dropKeys: options.dropKeys,
        colonyIds: options.colonyIds,
        settingsKeys: options.settingsKeys,
      }),
  });
}
