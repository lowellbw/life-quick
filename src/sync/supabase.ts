/**
 * Supabase client + remote adapter. The app runs fully in guest/local mode
 * when env vars are absent — Supabase is additive, never required.
 *
 * Env (set in .env.local):
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { UserState } from "../session/machine";
import type { RemoteAdapter } from "./adapter";

export function supabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
  }
  return client;
}

export async function currentUser(): Promise<User | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

/** Passwordless sign-in: email magic link. */
export async function signInWithEmail(email: string): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: "Accounts aren't set up on this deployment." };
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}

export function makeSupabaseAdapter(userId: string): RemoteAdapter {
  return {
    async pull() {
      const sb = supabase();
      if (!sb) return null;
      const { data, error } = await sb
        .from("user_state")
        .select("envelope, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return null;
      return {
        state: data.envelope as UserState,
        updatedAt: Date.parse(data.updated_at as string),
      };
    },
    async push(state: UserState, updatedAtMs: number) {
      const sb = supabase();
      if (!sb) return;
      await sb.from("user_state").upsert({
        user_id: userId,
        envelope: state,
        updated_at: new Date(updatedAtMs).toISOString(),
      });
    },
    async logEvent(type, payload) {
      const sb = supabase();
      if (!sb) return;
      await sb.from("events").insert({ user_id: userId, type, payload });
    },
    async reportOutcome(result, predictedPct, testDate) {
      const sb = supabase();
      if (!sb) return;
      await sb.from("outcomes").insert({
        user_id: userId,
        result,
        predicted_pct: predictedPct,
        test_date: testDate,
      });
    },
  };
}

/**
 * Merge policy at boot: last-write-wins on lastActiveAt. Deliberately simple
 * for v1 — the richer merge (max of evidence counters) is a flagged follow-up.
 */
export function pickNewer(local: UserState | null, remote: UserState | null): UserState | null {
  if (!local) return remote;
  if (!remote) return local;
  return remote.lastActiveAt > local.lastActiveAt ? remote : local;
}
