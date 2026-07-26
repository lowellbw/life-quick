/**
 * Versioned localStorage envelope with a migration map and corrupt-state
 * quarantine. The app never writes raw state — always through here.
 */

export const STORAGE_KEY = "ready:v1";

export interface Envelope<S> {
  v: number;
  savedAt: string;
  state: S;
}

type Migration = (state: unknown) => unknown;

/** v -> migration that lifts state from v to v+1. Empty until we need one. */
const MIGRATIONS: Record<number, Migration> = {};

export const CURRENT_VERSION = 1;

export interface StorageDriver {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory driver for tests and non-browser environments. */
export function memoryDriver(): StorageDriver {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

export function browserDriver(): StorageDriver {
  return window.localStorage;
}

export function saveState<S>(driver: StorageDriver, state: S, nowMs: number): void {
  const env: Envelope<S> = {
    v: CURRENT_VERSION,
    savedAt: new Date(nowMs).toISOString(),
    state,
  };
  driver.setItem(STORAGE_KEY, JSON.stringify(env));
}

export type LoadResult<S> =
  | { kind: "ok"; state: S; savedAt: string }
  | { kind: "empty" }
  | { kind: "corrupt" };

export function loadState<S>(driver: StorageDriver, nowMs: number): LoadResult<S> {
  const raw = driver.getItem(STORAGE_KEY);
  if (raw == null) return { kind: "empty" };
  try {
    const env = JSON.parse(raw) as Envelope<unknown>;
    if (typeof env !== "object" || env == null || typeof env.v !== "number" || !("state" in env)) {
      throw new Error("bad envelope");
    }
    let state: unknown = env.state;
    let v = env.v;
    while (v < CURRENT_VERSION) {
      const mig = MIGRATIONS[v];
      if (!mig) throw new Error(`no migration from v${v}`);
      state = mig(state);
      v++;
    }
    return { kind: "ok", state: state as S, savedAt: env.savedAt };
  } catch {
    // Quarantine, don't destroy: someone's study history is in here.
    try {
      driver.setItem(`ready:corrupt:${nowMs}`, raw);
      driver.removeItem(STORAGE_KEY);
    } catch {
      /* storage full — nothing more we can do */
    }
    return { kind: "corrupt" };
  }
}

export function clearState(driver: StorageDriver): void {
  driver.removeItem(STORAGE_KEY);
}
