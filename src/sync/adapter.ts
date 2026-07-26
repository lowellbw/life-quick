/**
 * Persistence adapters. Local mode is always on (write-through cache).
 * When Supabase is configured AND the user is signed in, the remote adapter
 * mirrors state up on a debounce and pulls it down at boot (last-write-wins).
 */
import type { UserState } from "../session/machine";

export interface RemoteAdapter {
  /** Pull the newest remote state, or null if none. */
  pull(): Promise<{ state: UserState; updatedAt: number } | null>;
  /** Push the current state (fire-and-forget safe). */
  push(state: UserState, updatedAtMs: number): Promise<void>;
  /** Append an analytics event (never blocks the UI). */
  logEvent(type: string, payload: Record<string, unknown>): Promise<void>;
  /** Record a post-test outcome. */
  reportOutcome(result: "passed" | "failed" | "not_yet", predictedPct: number | null, testDate: string | null): Promise<void>;
}

export const nullAdapter: RemoteAdapter = {
  pull: async () => null,
  push: async () => {},
  logEvent: async () => {},
  reportOutcome: async () => {},
};
