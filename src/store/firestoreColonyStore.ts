import type { Firestore } from "firebase/firestore";
import {
  toColonyEntry,
  type ColonyEntry,
  type ColonyStore,
  type Construction,
} from "./colonyStore";
import { createFirestoreDocumentStore, type DocumentCodec } from "./firestoreDocumentStore";
import type { SendScheduler, SyncStatusStore } from "./sendScheduler";

export type FirestoreColonyStore = ColonyStore & {
  syncStatus: SyncStatusStore;
  dispose(): void;
};

function encodeConstruction({
  kind,
  typeId,
  instance,
  count,
  targetLevel,
  finishAt,
}: Construction): string {
  return [kind, typeId, instance, count, targetLevel, finishAt].join(" ");
}

function decodeConstruction(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const [kind, typeId, ...numbers] = value.split(" ");
  const [instance, count, targetLevel, finishAt] = numbers.map(Number);
  return { kind, typeId, instance, count, targetLevel, finishAt };
}

function fromDocument(data: unknown): ColonyEntry | null {
  if (typeof data !== "object" || data === null) return null;
  const { starBase, buildings, constructions, updatedAt } = data as Record<string, unknown>;
  return toColonyEntry({
    starBaseLevel: starBase,
    buildings,
    constructions: Array.isArray(constructions)
      ? constructions.map(decodeConstruction)
      : constructions,
    updatedAt,
  });
}

export const COLONY_CODEC: DocumentCodec<ColonyEntry> = {
  fromDocument,
  toDocument: ({ starBaseLevel, buildings, constructions, updatedAt }) => ({
    starBase: starBaseLevel,
    buildings,
    ...(constructions && constructions.length > 0
      ? { constructions: constructions.map(encodeConstruction) }
      : {}),
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
