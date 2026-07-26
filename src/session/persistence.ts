/**
 * UserState <-> storage. UserState is plain JSON (records + arrays only), so
 * persistence is the versioned envelope from lib/storage plus a tiny sanity
 * gate. Written after every evidence-changing event; localStorage is the
 * write-through cache, remote sync (src/sync) piggybacks on the same writes.
 */
import { loadState, saveState, type StorageDriver } from "../lib/storage";
import type { UserState } from "./machine";

export function persist(driver: StorageDriver, state: UserState, nowMs: number): void {
  saveState(driver, state, nowMs);
}

export function restore(driver: StorageDriver, nowMs: number): UserState | null {
  const r = loadState<UserState>(driver, nowMs);
  if (r.kind !== "ok") return null;
  const s = r.state;
  if (typeof s.seed !== "number" || !s.screen || typeof s.screen.kind !== "string") return null;
  return s;
}
