import type { Firestore } from "firebase/firestore";
import { isDropEntry, type DropEntry, type DropStore } from "./dropStore";
import { createFirestoreDocumentStore, type DocumentCodec } from "./firestoreDocumentStore";
import type { SendScheduler, SyncStatusStore } from "./sendScheduler";

export type FirestoreDropStore = DropStore & {
  syncStatus: SyncStatusStore;
  isLoaded(key: string): boolean;
  dispose(): void;
};

export const DROP_CODEC: DocumentCodec<DropEntry> = {
  fromDocument: (data) => (isDropEntry(data) ? data : null),
  toDocument: ({ readyAt, updatedAt }) => ({ readyAt, updatedAt }),
};

export function createFirestoreDropStore(
  db: Firestore,
  uid: string,
  scheduler: SendScheduler,
): FirestoreDropStore {
  const store = createFirestoreDocumentStore<DropEntry>(db, uid, "drops", DROP_CODEC, scheduler);
  return {
    ...store,
    set: (key, readyAt, updatedAt) => store.set(key, { readyAt, updatedAt }),
  };
}
