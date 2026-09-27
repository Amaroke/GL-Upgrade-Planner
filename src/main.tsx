import type { FirebaseApp } from "firebase/app";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./components/App.tsx";
import type { AuthService } from "./auth/auth.ts";
import { createFirebaseAuthServiceFromApp, getFirebaseApp } from "./auth/firebaseAuth.ts";
import { readFirebaseConfig } from "./config/firebaseConfig.ts";
import { DROPS } from "./drops.ts";
import { COLONIES } from "./planner/colonies.ts";
import { createFirestoreAccountSync, type LoadingStore } from "./store/accountSync.ts";
import { createLocalStorageColonyStore, type ColonyStore } from "./store/colonyStore.ts";
import { createLocalStorageDropStore, type DropStore } from "./store/dropStore.ts";
import { createAppFirestore } from "./store/firestoreDocumentStore.ts";
import {
  createLocalStorageSettingsStore,
  migrateLegacyOnlyToUpgrade,
  SETTINGS_KEYS,
  type SettingsStore,
} from "./store/settingsStore.ts";

function createStores(
  app: FirebaseApp | null,
  auth: AuthService,
  local: { drops: DropStore; colonies: ColonyStore; settings: SettingsStore },
): { drops: DropStore; colonies: ColonyStore; settings: SettingsStore; loading?: LoadingStore } {
  if (!app) return local;
  try {
    return createFirestoreAccountSync({
      auth,
      localDrops: local.drops,
      localColonies: local.colonies,
      localSettings: local.settings,
      db: createAppFirestore(app),
      dropKeys: DROPS.map((drop) => drop.storageKey),
      colonyIds: COLONIES.map((colony) => colony.id),
      settingsKeys: SETTINGS_KEYS,
    });
  } catch {
    return local;
  }
}

const app = getFirebaseApp(readFirebaseConfig());
const auth = createFirebaseAuthServiceFromApp(app);
const localSettings = createLocalStorageSettingsStore();
migrateLegacyOnlyToUpgrade(localSettings);
const stores = createStores(app, auth, {
  drops: createLocalStorageDropStore(),
  colonies: createLocalStorageColonyStore(),
  settings: localSettings,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App
      store={stores.drops}
      auth={auth}
      now={Date.now}
      colonyStore={stores.colonies}
      settingsStore={stores.settings}
      loading={stores.loading}
    />
  </StrictMode>,
);
