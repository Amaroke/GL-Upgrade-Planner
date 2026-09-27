import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onSnapshot, setDoc } from "firebase/firestore";
import { createFirestoreDropStore } from "./firestoreDropStore";
import { createSendScheduler } from "./sendScheduler";

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  onSnapshot: vi.fn(() => vi.fn()),
  setDoc: vi.fn(() => Promise.resolve()),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const FAKE_DB = {} as never;

const createdStores: { dispose(): void }[] = [];

function createStore() {
  const store = createFirestoreDropStore(FAKE_DB, "player-1", createSendScheduler());
  createdStores.push(store);
  return store;
}

async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("createFirestoreDropStore sync status", () => {
  beforeEach(() => {
    vi.mocked(onSnapshot).mockReturnValue(vi.fn());
    vi.mocked(setDoc).mockReturnValue(Promise.resolve());
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    createdStores.splice(0).forEach((store) => store.dispose());
    vi.restoreAllMocks();
  });

  it("starts synced when nothing is pending", () => {
    const store = createStore();
    expect(store.syncStatus.getStatus()).toBe("synced");
  });

  it("keeps a change pending until it is sent, then reports sending and synced", async () => {
    const write = deferred<void>();
    vi.mocked(setDoc).mockReturnValueOnce(write.promise);
    const store = createStore();

    store.set("gl-timer-star-battery", 1000, 500);
    expect(store.syncStatus.getStatus()).toBe("pending");
    expect(setDoc).not.toHaveBeenCalled();

    store.syncStatus.saveNow();
    expect(store.syncStatus.getStatus()).toBe("sending");

    write.resolve();
    await flush();

    expect(store.syncStatus.getStatus()).toBe("synced");
  });

  it("reports error when a send fails", async () => {
    vi.mocked(setDoc).mockRejectedValueOnce({ code: "permission-denied" });
    const store = createStore();

    store.set("gl-timer-star-battery", 1000, 500);
    store.syncStatus.saveNow();
    await flush();

    expect(store.syncStatus.getStatus()).toBe("error");
  });

  it("clears a previous error once a later send succeeds", async () => {
    vi.mocked(setDoc).mockRejectedValueOnce({ code: "permission-denied" });
    const store = createStore();
    store.set("gl-timer-star-battery", 1000, 500);
    store.syncStatus.saveNow();
    await flush();
    expect(store.syncStatus.getStatus()).toBe("error");

    store.syncStatus.saveNow();
    await flush();

    expect(store.syncStatus.getStatus()).toBe("synced");
  });

  it("reports offline while changes wait for connectivity, and sends them when it returns", async () => {
    const store = createStore();
    store.set("gl-timer-star-battery", 1000, 500);

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));
    expect(store.syncStatus.getStatus()).toBe("offline");

    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    window.dispatchEvent(new Event("online"));
    await flush();

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(store.syncStatus.getStatus()).toBe("synced");
  });

  it("stays synced while offline with nothing to send", () => {
    const store = createStore();

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));

    expect(store.syncStatus.getStatus()).toBe("synced");
  });

  it("reports error when the snapshot listener fails with a non-transient error", () => {
    let errorCallback: ((error: unknown) => void) | undefined;
    vi.mocked(onSnapshot).mockImplementation((...args: unknown[]) => {
      errorCallback = args[2] as (error: unknown) => void;
      return vi.fn();
    });
    const store = createStore();
    store.get("gl-timer-star-battery");

    errorCallback?.({ code: "permission-denied" });

    expect(store.syncStatus.getStatus()).toBe("error");
  });

  it("does not recreate the listener on repeated access after a non-transient error", () => {
    let errorCallback: ((error: unknown) => void) | undefined;
    vi.mocked(onSnapshot).mockImplementation((...args: unknown[]) => {
      errorCallback = args[2] as (error: unknown) => void;
      return vi.fn();
    });
    const store = createStore();
    store.get("gl-timer-star-battery");
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    errorCallback?.({ code: "permission-denied" });
    store.get("gl-timer-star-battery");
    store.get("gl-timer-star-battery");

    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("clears a previous error once a later snapshot succeeds", () => {
    let onNext: ((snapshot: unknown) => void) | undefined;
    let errorCallback: ((error: unknown) => void) | undefined;
    vi.mocked(onSnapshot).mockImplementation((...args: unknown[]) => {
      onNext = args[1] as (snapshot: unknown) => void;
      errorCallback = args[2] as (error: unknown) => void;
      return vi.fn();
    });
    const store = createStore();
    store.get("gl-timer-star-battery");
    errorCallback?.({ code: "permission-denied" });
    expect(store.syncStatus.getStatus()).toBe("error");

    onNext?.({ data: () => undefined });

    expect(store.syncStatus.getStatus()).toBe("synced");
  });

  it("notifies subscribers only when the status actually changes", async () => {
    const write = deferred<void>();
    vi.mocked(setDoc).mockReturnValueOnce(write.promise);
    const store = createStore();
    const onChange = vi.fn();
    store.syncStatus.subscribe(onChange);

    store.set("gl-timer-star-battery", 1000, 500);
    store.set("gl-timer-star-battery", 2000, 600);
    expect(onChange).toHaveBeenCalledTimes(1);

    store.syncStatus.saveNow();
    write.resolve();
    await flush();

    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("stops listening and sending once disposed", () => {
    const unwatch = vi.fn();
    vi.mocked(onSnapshot).mockReturnValue(unwatch);
    const store = createStore();
    store.get("gl-timer-star-battery");
    store.set("gl-timer-star-battery", 1000, 500);

    store.dispose();
    store.syncStatus.saveNow();

    expect(unwatch).toHaveBeenCalledTimes(1);
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe("createFirestoreDropStore loading", () => {
  afterEach(() => {
    createdStores.splice(0).forEach((store) => store.dispose());
    vi.restoreAllMocks();
  });

  function captureListener() {
    const captured: {
      onNext?: (snapshot: unknown) => void;
      onError?: (error: unknown) => void;
    } = {};
    vi.mocked(onSnapshot).mockImplementation((...args: unknown[]) => {
      captured.onNext = args[1] as (snapshot: unknown) => void;
      captured.onError = args[2] as (error: unknown) => void;
      return vi.fn();
    });
    return captured;
  }

  it("is not loaded until the account has answered, even with no document", () => {
    const listener = captureListener();
    const store = createStore();
    const onChange = vi.fn();
    store.subscribe("gl-timer-star-battery", onChange);

    expect(store.isLoaded("gl-timer-star-battery")).toBe(false);

    listener.onNext?.({ data: () => undefined });

    expect(store.isLoaded("gl-timer-star-battery")).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it.each(["permission-denied", "unavailable"])(
    "counts as loaded once the listener stops on a %s error, and notifies",
    (code) => {
      const listener = captureListener();
      const store = createStore();
      const onChange = vi.fn();
      store.subscribe("gl-timer-star-battery", onChange);

      listener.onError?.({ code });

      expect(store.isLoaded("gl-timer-star-battery")).toBe(true);
      expect(onChange).toHaveBeenCalled();
    },
  );
});
