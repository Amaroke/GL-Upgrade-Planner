import type { Firestore } from "firebase/firestore";
import { toColonyEntry, type ColonyEntry, type ColonyStore } from "./colonyStore";
import { createFirestoreDocumentStore, type DocumentCodec } from "./firestoreDocumentStore";
import type { SendScheduler, SyncStatusStore } from "./sendScheduler";

export type FirestoreColonyStore = ColonyStore & {
  syncStatus: SyncStatusStore;
  dispose(): void;
};

function fromDocument(data: unknown): ColonyEntry | null {
  if (typeof data !== "object" || data === null) return null;
  const { starBase, buildings, constructions, updatedAt } = data as Record<string, unknown>;
  return toColonyEntry({ starBaseLevel: starBase, buildings, constructions, updatedAt });
}

export const COLONY_CODEC: DocumentCodec<ColonyEntry> = {
  fromDocument,
  toDocument: ({ starBaseLevel, buildings, constructions, updatedAt }) => ({
    starBase: starBaseLevel,
    buildings,
    ...(constructions && constructions.length > 0 ? { constructions } : {}),
    updatedAt,
  }),
};

export function createFirestoreColonyStore(
  db: Firestore,
  uid: string,
  scheduler: SendScheduler,
): FirestoreColonyStore {
  return createFirestoreDocumentStore<ColonyEntry>(db, uid, "colonies", COLONY_CODEC, scheduler);
}
