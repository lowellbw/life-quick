/**
 * App shell: owns the session store, persistence (write after every event),
 * optional Supabase sync (guest mode when unconfigured), and the single
 * polite aria-live region announcing meter changes.
 *
 * State lives in a small external store rather than useState: dispatches are
 * applied synchronously (side effects outside React's updater), and the tree
 * subscribes via useSyncExternalStore — no lost re-renders from timer-fired
 * events, no side effects inside updaters.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import bankJson from "./content/bank.json";
import type { Bank } from "./content/types";
import { initialState, reduce, type Event, type UiEvent, type UserState } from "./session/machine";
import { persist, restore } from "./session/persistence";
import { browserDriver } from "./lib/storage";
import { realClock } from "./lib/time";
import { nullAdapter, type RemoteAdapter } from "./sync/adapter";
import {
  currentUser,
  makeSupabaseAdapter,
  pickNewer,
  signInWithEmail,
  signOut,
  supabaseConfigured,
} from "./sync/supabase";
import { screenFor } from "./ui/screens";
import "./ui/tokens.css";
import "./ui/motion.css";

const bank = bankJson as unknown as Bank;

function freshSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

interface SessionStore {
  get: () => UserState | null;
  set: (s: UserState) => void;
  subscribe: (l: () => void) => () => void;
}

function makeStore(): SessionStore {
  let state: UserState | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(s) {
      state = s;
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export default function App() {
  const driver = useMemo(() => browserDriver(), []);
  const store = useMemo(() => makeStore(), []);
  const state = useSyncExternalStore(store.subscribe, store.get);
  const [account, setAccount] = useState<{ email: string } | null>(null);
  const remoteRef = useRef<RemoteAdapter>(nullAdapter);
  const pushTimer = useRef<number | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  // boot: local state, then (if configured) reconcile with remote
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = realClock.now();
      const local = restore(driver, now);
      let chosen = local;
      if (supabaseConfigured()) {
        const user = await currentUser();
        if (user && !cancelled) {
          setAccount({ email: user.email ?? "account" });
          remoteRef.current = makeSupabaseAdapter(user.id);
          const remote = await remoteRef.current.pull();
          chosen = pickNewer(local, remote?.state ?? null);
        }
      }
      if (cancelled) return;
      const base = chosen ?? initialState(freshSeed(), now);
      const booted = reduce(base, { type: "BOOT", nowMs: now }, bank);
      persist(driver, booted, now);
      store.set(booted);
    })();
    return () => {
      cancelled = true;
    };
  }, [driver, store]);

  const dispatch = useCallback(
    (partial: UiEvent) => {
      const prev = store.get();
      if (!prev) return;
      const nowMs = partial.nowMs ?? realClock.now();
      const ev = { ...partial, nowMs } as Event;
      const next = reduce(prev, ev, bank);
      if (next === prev) return;
      // synchronous: store first (render), then side effects
      store.set(next);
      persist(driver, next, nowMs);
      const boundary = ["BLOCK_DONE_ACK", "MOCK_RESULTS_ACK", "OUTCOME_REPORT", "SPEED_MARK"].includes(ev.type);
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(
        () => void remoteRef.current.push(next, nowMs),
        boundary ? 250 : 4000,
      );
      if (ev.type === "OUTCOME_REPORT") {
        void remoteRef.current.reportOutcome(ev.result, next.meter.lastShownPct, next.setup?.testDateISO ?? null);
      }
      if (liveRef.current && next.meter.unlocked && next.meter.lastShownPct !== prev.meter.lastShownPct) {
        liveRef.current.textContent = `Estimated chance of passing: ${next.meter.lastShownPct} percent.`;
      }
    },
    [driver, store],
  );

  if (!state) {
    return (
      <div className="app-frame">
        <div className="sheet" style={{ alignItems: "center", justifyContent: "center" }}>
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  const Active = screenFor(state.screen.kind);
  const started = state.screen.kind !== "intro";
  return (
    <div className="app-frame">
      <div className="sheet">
        <div className="topbar">
          <span className="wordmark">Ready</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            {started && (
              <button
                className="btn quiet"
                style={{ width: "auto", minHeight: 36, fontSize: "0.85rem" }}
                onClick={() => {
                  if (window.confirm("Start over from scratch? Your progress here will be erased.")) {
                    dispatch({ type: "RESET_ALL", seed: freshSeed() });
                  }
                }}
              >
                Start over
              </button>
            )}
            <AccountControl account={account} onAccount={setAccount} />
          </span>
        </div>
        <Active bank={bank} state={state} dispatch={dispatch} />
        <div ref={liveRef} aria-live="polite" className="sr-only" />
      </div>
    </div>
  );
}

function AccountControl({
  account,
  onAccount,
}: {
  account: { email: string } | null;
  onAccount: (a: { email: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  if (!supabaseConfigured()) return null;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      {account ? (
        <button
          className="btn quiet"
          style={{ width: "auto" }}
          onClick={() => void signOut().then(() => onAccount(null))}
        >
          {account.email} · sign out
        </button>
      ) : open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signInWithEmail(email).then(({ error }) => setSent(error ?? "Check your email for a sign-in link."));
          }}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          {sent ? (
            <span className="muted small">{sent}</span>
          ) : (
            <>
              <input
                type="email"
                required
                placeholder="you@example.com"
                aria-label="Email for sign-in link"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  minHeight: 44,
                  padding: "0 0.75rem",
                  border: "1.5px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
              <button className="btn" style={{ width: "auto", minHeight: 44 }} type="submit">
                Send link
              </button>
            </>
          )}
        </form>
      ) : (
        <button className="btn quiet" style={{ width: "auto" }} onClick={() => setOpen(true)}>
          Save progress across devices
        </button>
      )}
    </div>
  );
}
