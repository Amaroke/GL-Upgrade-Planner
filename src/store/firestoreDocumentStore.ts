import type { FirebaseApp } from "firebase/app";
import {
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import type { SendScheduler, SyncStatusStore } from "./sendScheduler";

export function createAppFirestore(app: FirebaseApp): Firestore {
  return initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
}

export type DocumentCodec<T extends { updatedAt: number }> = {
  fromDocument(data: unknown): T | null;
  toDocument(entry: T): DocumentData;
};

export type FirestoreDocumentStore<T> = {
  get(key: string): T | null;
  set(key: string, entry: T): void;
  subscribe(key: string, onChange: () => void): () => void;
  isLoaded(key: string): boolean;
  syncStatus: SyncStatusStore;
  dispose(): void;
};

const TRANSIENT_ERROR_CODES = new Set(["unavailable", "deadline-exceeded", "cancelled"]);

function isTransientError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code !== undefined && TRANSIENT_ERROR_CODES.has(code);
}

export function createFirestoreDocumentStore<T extends { updatedAt: number }>(
  db: Firestore,
  uid: string,
  collection: string,
  codec: DocumentCodec<T>,
  scheduler: SendScheduler,
): FirestoreDocumentStore<T> {
  const cache = new Map<string, T | null>();
  const pending = new Map<string, T>();
  const listeners = new Map<string, Set<() => void>>();
  const unwatchers = new Map<string, () => void>();
  const failed = new Set<string>();
  const refOf = (key: string) => doc(db, "users", uid, collection, key);

  const unregister = scheduler.register({
    hasPending: () => pending.size > 0,
    async send() {
      const batch = new Map(pending);
      await Promise.all(
        [...batch].map(([key, entry]) => setDoc(refOf(key), codec.toDocument(entry))),
      );
      batch.forEach((entry, key) => {
        if (pending.get(key) === entry) pending.delete(key);
      });
    },
  });

  function ensureWatched(key: string) {
    if (unwatchers.has(key)) return;
    const unwatch = onSnapshot(
      refOf(key),
      (snapshot) => {
        const remote = codec.fromDocument(snapshot.data());
        const local = pending.get(key);
        scheduler.setReadFailed(false);
        if (local && (!remote || remote.updatedAt < local.updatedAt)) return;
        if (local) pending.delete(key);
        cache.set(key, remote);
        scheduler.changed();
        listeners.get(key)?.forEach((onChange) => onChange());
      },
      (error) => {
        if (!isTransientError(error)) scheduler.setReadFailed(true);
        failed.add(key);
        listeners.get(key)?.forEach((onChange) => onChange());
      },
    );
    unwatchers.set(key, unwatch);
  }

  return {
    get(key) {
      ensureWatched(key);
      return cache.get(key) ?? null;
    },
    set(key, entry) {
      cache.set(key, entry);
      pending.set(key, entry);
      listeners.get(key)?.forEach((onChange) => onChange());
      scheduler.changed();
    },
    subscribe(key, onChange) {
      ensureWatched(key);
      const keyListeners = listeners.get(key) ?? new Set<() => void>();
      keyListeners.add(onChange);
      listeners.set(key, keyListeners);
      return () => {
        keyListeners.delete(onChange);
        if (keyListeners.size > 0) return;
        listeners.delete(key);
        unwatchers.get(key)?.();
        unwatchers.delete(key);
      };
    },
    isLoaded(key) {
      ensureWatched(key);
      return cache.has(key) || failed.has(key);
    },
    syncStatus: scheduler.syncStatus,
    dispose() {
      unregister();
      unwatchers.forEach((unwatch) => unwatch());
      unwatchers.clear();
      scheduler.dispose();
    },
  };
}

export async function mergeLocalIntoCollection<T extends { updatedAt: number }>(
  db: Firestore,
  uid: string,
  collection: string,
  codec: DocumentCodec<T>,
  readLocal: (key: string) => T | null,
  keys: readonly string[],
): Promise<void> {
  await Promise.all(
    keys.map(async (key) => {
      const local = readLocal(key);
      if (!local) return;
      const ref = doc(db, "users", uid, collection, key);
      const account = codec.fromDocument((await getDoc(ref)).data());
      if (account && account.updatedAt >= local.updatedAt) return;
      await setDoc(ref, codec.toDocument(local));
    }),
  );
}
