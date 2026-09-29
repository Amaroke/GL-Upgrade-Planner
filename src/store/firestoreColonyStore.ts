import type { Firestore } from "firebase/firestore";
import {
  toColonyEntry,
  type ColonyEntry,
  type ColonyStore,
  type Construction,
  type LabJob,
} from "./colonyStore";
import { createFirestoreDocumentStore, type DocumentCodec } from "./firestoreDocumentStore";
import type { SendScheduler, SyncStatusStore } from "./sendScheduler";

export type FirestoreColonyStore = ColonyStore & {
  syncStatus: SyncStatusStore;
  isLoaded(key: string): boolean;
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

function encodeLabJob({ unitId, targetLevel, finishAt }: LabJob): string {
  return [unitId, targetLevel, finishAt].join(" ");
}

function decodeLabJob(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const [unitId, targetLevel, finishAt] = value.split(" ");
  return { unitId, targetLevel: Number(targetLevel), finishAt: Number(finishAt) };
}

function fromDocument(data: unknown): ColonyEntry | null {
  if (typeof data !== "object" || data === null) return null;
  const { starBase, buildings, constructions, workers, units, research, unlock, updatedAt } =
    data as Record<string, unknown>;
  return toColonyEntry({
    starBaseLevel: starBase,
    buildings,
    constructions: Array.isArray(constructions)
      ? constructions.map(decodeConstruction)
      : constructions,
    workers,
    units,
    research: decodeLabJob(research),
    unlock: decodeLabJob(unlock),
    updatedAt,
  });
}

export const COLONY_CODEC: DocumentCodec<ColonyEntry> = {
  fromDocument,
  toDocument: ({
    starBaseLevel,
    buildings,
    constructions,
    workers,
    units,
    research,
    unlock,
    updatedAt,
  }) => ({
    starBase: starBaseLevel,
    buildings,
    ...(constructions && constructions.length > 0
      ? { constructions: constructions.map(encodeConstruction) }
      : {}),
    ...(workers === undefined ? {} : { workers }),
    ...(units === undefined ? {} : { units }),
    ...(research === undefined ? {} : { research: encodeLabJob(research) }),
    ...(unlock === undefined ? {} : { unlock: encodeLabJob(unlock) }),
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
