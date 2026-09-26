import { useState } from "react";
import { AccountControl } from "./AccountControl";
import { Modal } from "./Modal";
import { NotificationsControl } from "./NotificationsControl";
import { Planner } from "./Planner";
import { TimerCard } from "./TimerCard";
import { TimerChip, TimerChipSkeleton } from "./TimerChip";
import type { AuthService } from "../auth/auth";
import { useAuth } from "../auth/useAuth";
import { DROPS } from "../drops";
import { useDropsTimers, type DropTimerState } from "../hooks/useDropsTimers";
import { useReadyDropTitle } from "../hooks/useReadyDropTitle";
import { useReadyNotifications } from "../hooks/useReadyNotifications";
import { CATALOG, type Catalog } from "../planner/catalog";
import { createMemoryColonyStore, type ColonyStore } from "../store/colonyStore";
import type { DropStore } from "../store/dropStore";
import { createMemorySettingsStore, type SettingsStore } from "../store/settingsStore";

type AppProps = {
  store: DropStore;
  auth: AuthService;
  now: () => number;
  colonyStore?: ColonyStore;
  settingsStore?: SettingsStore;
  catalog?: Catalog;
};

const STORAGE_KEYS = DROPS.map((drop) => drop.storageKey);

function TimerChipsRow({
  auth,
  timers,
  onOpenAdvanced,
}: {
  auth: AuthService;
  timers: Record<string, DropTimerState>;
  onOpenAdvanced: (storageKey: string) => void;
}) {
  const authState = useAuth(auth);
  const isRestoring = authState.status === "restoring";

  return (
    <div
      role={isRestoring ? "status" : undefined}
      aria-label={isRestoring ? "Loading your timers" : undefined}
      className="flex flex-col gap-3 sm:flex-1 sm:flex-row sm:flex-nowrap sm:justify-center sm:gap-4"
    >
      {isRestoring
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

function App({ store, auth, now, colonyStore, settingsStore, catalog = CATALOG }: AppProps) {
  const [fallbackColonyStore] = useState(createMemoryColonyStore);
  const [fallbackSettingsStore] = useState(createMemorySettingsStore);
  useReadyDropTitle(store, STORAGE_KEYS, now);
  const { permission, requestPermission } = useReadyNotifications(DROPS, store, now);
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

          <TimerChipsRow auth={auth} timers={timers} onOpenAdvanced={setAdvancedDropKey} />

          <div className="sm:shrink-0">
            <AccountControl auth={auth} store={store} />
          </div>
        </div>

        <Planner
          store={colonyStore ?? fallbackColonyStore}
          settingsStore={settingsStore ?? fallbackSettingsStore}
          catalog={catalog}
          now={now}
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
