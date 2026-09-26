import type { Firestore } from "firebase/firestore";
import { createFirestoreDocumentStore, type DocumentCodec } from "./firestoreDocumentStore";
import type { SendScheduler, SyncStatusStore } from "./sendScheduler";
import { toPlannerSettings, type PlannerSettings, type SettingsStore } from "./settingsStore";

export type FirestoreSettingsStore = SettingsStore & {
  syncStatus: SyncStatusStore;
  dispose(): void;
};

export const SETTINGS_CODEC: DocumentCodec<PlannerSettings> = {
  fromDocument: toPlannerSettings,
  toDocument: ({ onlyToUpgrade, hideWallUpgrades, updatedAt }) => ({
    onlyToUpgrade,
    hideWallUpgrades,
    updatedAt,
  }),
};

export function createFirestoreSettingsStore(
  db: Firestore,
  uid: string,
  scheduler: SendScheduler,
): FirestoreSettingsStore {
  return createFirestoreDocumentStore<PlannerSettings>(
    db,
    uid,
    "settings",
    SETTINGS_CODEC,
    scheduler,
  );
}
