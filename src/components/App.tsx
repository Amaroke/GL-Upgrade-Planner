import { useCallback, useState, useSyncExternalStore } from "react";
import { AccountControl } from "./AccountControl";
import { Modal } from "./Modal";
import { NotificationsControl } from "./NotificationsControl";
import { Planner } from "./Planner";
import { TimerCard } from "./TimerCard";
import { TimerChip, TimerChipSkeleton } from "./TimerChip";
import type { AuthService } from "../auth/auth";
import { useAuth } from "../auth/useAuth";
import { dropNotices, DROPS } from "../drops";
import { useDropsTimers, type DropTimerState } from "../hooks/useDropsTimers";
import { useReadyTitle } from "../hooks/useReadyTitle";
import { useReadyNotifications } from "../hooks/useReadyNotifications";
import { CATALOG, type Catalog } from "../planner/catalog";
import { constructionNotices } from "../planner/constructions";
import { labNotices } from "../planner/laboratory";
import { totalIdleWorkers } from "../planner/workers";
import type { LoadingStore } from "../store/accountSync";
import { createMemoryColonyStore, type ColonyStore } from "../store/colonyStore";
import type { DropStore } from "../store/dropStore";
import {
  createMemorySettingsStore,
  PLANNER_SETTINGS_KEY,
  type SettingsStore,
} from "../store/settingsStore";

type AppProps = {
  store: DropStore;
  auth: AuthService;
  now: () => number;
  colonyStore?: ColonyStore;
  settingsStore?: SettingsStore;
  catalog?: Catalog;
  loading?: LoadingStore;
};

const NOT_LOADING: LoadingStore = { isLoading: () => false, subscribe: () => () => {} };

function useIsLoading(auth: AuthService, loading: LoadingStore | undefined): boolean {
  const isRestoring = useAuth(auth).status === "restoring";
  const store = loading ?? NOT_LOADING;
  const isStoreLoading = useSyncExternalStore(store.subscribe, store.isLoading);
  return loading ? isStoreLoading : isRestoring;
}

function TimerChipsRow({
  isLoading,
  timers,
  onOpenAdvanced,
}: {
  isLoading: boolean;
  timers: Record<string, DropTimerState>;
  onOpenAdvanced: (storageKey: string) => void;
}) {
  return (
    <div
      role={isLoading ? "status" : undefined}
      aria-label={isLoading ? "Loading your timers" : undefined}
      className="flex flex-col gap-3 sm:flex-1 sm:flex-row sm:flex-nowrap sm:justify-center sm:gap-4"
    >
      {isLoading
        ? DROPS.map((drop) => <TimerChipSkeleton key={drop.storageKey} />)
        : DROPS.map((drop) => (
            <TimerChip
              key={drop.storageKey}
              {...drop}
              {...timers[drop.storageKey]}
              onOpenAdvanced={() => onOpenAdvanced(drop.storageKey)}
            />
          ))}
    </div>
  );
}

function App({
  store,
  auth,
  now,
  colonyStore,
  settingsStore,
  catalog = CATALOG,
  loading,
}: AppProps) {
  const isLoading = useIsLoading(auth, loading);
  const [fallbackColonyStore] = useState(createMemoryColonyStore);
  const [fallbackSettingsStore] = useState(createMemorySettingsStore);
  const colonies = colonyStore ?? fallbackColonyStore;
  const settings = settingsStore ?? fallbackSettingsStore;
  const readNotices = useCallback(
    () =>
      isLoading
        ? []
        : [
            ...dropNotices(store),
            ...constructionNotices(catalog, colonies),
            ...labNotices(catalog, colonies),
          ],
    [store, catalog, colonies, isLoading],
  );
  const readIdleWorkers = useCallback(
    () =>
      isLoading
        ? 0
        : totalIdleWorkers(
            catalog,
            colonies,
            settings.get(PLANNER_SETTINGS_KEY)?.hideWallUpgrades ?? false,
            now(),
          ),
    [catalog, colonies, settings, isLoading, now],
  );
  useReadyTitle(readNotices, now, readIdleWorkers);
  const { permission, requestPermission } = useReadyNotifications(readNotices, now);
  const timers = useDropsTimers(DROPS, store, now);
  const [advancedDropKey, setAdvancedDropKey] = useState<string | null>(null);
  const advancedDrop = DROPS.find((drop) => drop.storageKey === advancedDropKey) ?? null;

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col px-6 py-8">
      <main className="flex flex-1 flex-col">
        <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="hidden sm:block sm:shrink-0">
            <NotificationsControl permission={permission} requestPermission={requestPermission} />
          </div>

          <TimerChipsRow
            isLoading={isLoading}
            timers={timers}
            onOpenAdvanced={setAdvancedDropKey}
          />

          <div className="sm:shrink-0">
            <AccountControl auth={auth} store={store} />
          </div>
        </div>

        <Planner
          store={colonies}
          settingsStore={settings}
          catalog={catalog}
          now={now}
          isLoading={isLoading}
        />
      </main>

      {advancedDrop && (
        <Modal
          label={`Advanced settings for ${advancedDrop.name}`}
          onClose={() => setAdvancedDropKey(null)}
        >
          <TimerCard
            key={advancedDrop.storageKey}
            {...advancedDrop}
            {...timers[advancedDrop.storageKey]}
            now={now}
          />
        </Modal>
      )}
    </div>
  );
}

export default App;
