import { createNotifier } from "./pubSub";

export type EntryStore<T> = {
  get(key: string): T | null;
  set(key: string, entry: T): void;
  subscribe(key: string, onChange: () => void): () => void;
};

function parseEntry<T>(stored: string, toEntry: (value: unknown) => T | null): T | null {
  try {
    return toEntry(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function createLocalStorageEntryStore<T>(
  prefix: string,
  toEntry: (value: unknown) => T | null,
): EntryStore<T> {
  const sameTab = createNotifier<string>();
  const parsed = new Map<string, { stored: string; entry: T | null }>();
  return {
    get(key) {
      const storageKey = prefix + key;
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;
      const cached = parsed.get(storageKey);
      if (cached?.stored === stored) return cached.entry;
      const entry = parseEntry(stored, toEntry);
      parsed.set(storageKey, { stored, entry });
      return entry;
    },
    set(key, entry) {
      localStorage.setItem(prefix + key, JSON.stringify(entry));
      sameTab.notify(key);
    },
    subscribe(key, onChange) {
      const storageKey = prefix + key;
      const handleStorage = (event: StorageEvent) => {
        if (event.storageArea !== localStorage) return;
        if (event.key === null || event.key === storageKey) onChange();
      };
      window.addEventListener("storage", handleStorage);
      const unsubscribeSameTab = sameTab.subscribe((changedKey) => {
        if (changedKey === key) onChange();
      });
      return () => {
        window.removeEventListener("storage", handleStorage);
        unsubscribeSameTab();
      };
    },
  };
}

export function createMemoryEntryStore<T>(): EntryStore<T> {
  const values = new Map<string, T>();
  const notifier = createNotifier<string>();
  return {
    get: (key) => values.get(key) ?? null,
    set(key, entry) {
      values.set(key, entry);
      notifier.notify(key);
    },
    subscribe(key, onChange) {
      return notifier.subscribe((changedKey) => {
        if (changedKey === key) onChange();
      });
    },
  };
}
