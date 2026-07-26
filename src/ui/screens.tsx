/** All screens. Copy voice: plain, brief, second person, no exclamation marks. */
import { useEffect } from "react";
import type { Bank } from "../content/types";
import type { Screen as MachineScreen, UiEvent, UserState } from "../session/machine";
import { factById, meterView, variantById } from "../session/machine";
import { TUNING } from "../model/tuning";
import { Bold, Hairline, MemoryCard, Meter, Screen } from "./components";
import { Question } from "./Question";

interface ScreenProps {
  bank: Bank;
  state: UserState;
  dispatch: (e: UiEvent) => void;
}

const BOOKING_URL = "https://www.gov.uk/life-in-the-uk-test";

/** Hand-drawn-feel line symbols: crown, teacup, Big Ben, bus, umbrella. */
function Symbols() {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <div className="symbol-row" aria-hidden="true">
      {/* crown */}
      <svg width="44" height="44" viewBox="0 0 44 44" {...{}}>
        <path {...s} d="M8 30 L6 14 L14 21 L22 10 L30 21 L38 14 L36 30 Z" />
        <path {...s} d="M8 34 H36" />
      </svg>
      {/* teacup */}
      <svg className="accent" width="44" height="44" viewBox="0 0 44 44">
        <path {...s} d="M8 18 H32 V26 a10 10 0 0 1 -10 10 h-4 a10 10 0 0 1 -10 -10 Z" />
        <path {...s} d="M32 20 h3 a5 5 0 0 1 0 10 h-4" />
        <path {...s} d="M15 12 c0 -2 2 -2 2 -4 M22 12 c0 -2 2 -2 2 -4" />
      </svg>
      {/* Big Ben */}
      <svg width="44" height="52" viewBox="0 0 44 52">
        <path {...s} d="M16 46 V14 H28 V46" />
        <path {...s} d="M14 14 L22 5 L30 14" />
        <circle {...s} cx="22" cy="22" r="4.5" />
        <path {...s} d="M22 19.5 V22 L24 23.5" />
        <path {...s} d="M12 46 H32" />
      </svg>
      {/* double-decker bus */}
      <svg className="accent" width="52" height="44" viewBox="0 0 52 44">
        <rect {...s} x="6" y="8" width="40" height="26" rx="4" />
        <path {...s} d="M6 21 H46" />
        <path {...s} d="M12 12.5 V17 M20 12.5 V17 M28 12.5 V17 M36 12.5 V17 M12 25.5 V30 M20 25.5 V30 M28 25.5 V30" />
        <circle {...s} cx="15" cy="36" r="3.5" />
        <circle {...s} cx="37" cy="36" r="3.5" />
      </svg>
      {/* umbrella */}
      <svg width="44" height="44" viewBox="0 0 44 44">
        <path {...s} d="M6 20 a16 16 0 0 1 32 0 Z" />
        <path {...s} d="M22 20 V34 a4 4 0 0 0 8 0" />
        <path {...s} d="M22 4 V7" />
      </svg>
    </div>
  );
}

export function IntroScreen({ dispatch }: ScreenProps) {
  return (
    <Screen center>
      <span className="kicker">Life in the UK test</span>
      <h1 className="display" style={{ marginTop: "0.5rem" }}>
        Two focused hours. Not a lost weekend.
      </h1>
      <Symbols />
      <p style={{ margin: "0 0 0.25rem" }}>
        Most people grind through a 180-page handbook — mostly re-reading things they already know. This
        works the other way round:
      </p>
      <ol className="method">
        <li>
          <span>
            <strong>Clear the easy stuff first.</strong> A six-minute fast pass — tap whether you already
            knew each fact. Be honest; it only changes what we practise.
          </span>
        </li>
        <li>
          <span>
            <strong>Drill only what's left.</strong> Real questions in 7-minute blocks. Wrong answers flip
            into short memory cards — that's the app finding what's worth your time.
          </span>
        </li>
        <li>
          <span>
            <strong>Stop when the number says stop.</strong> A live, honest chance-of-passing. At 95% we
            tell you to close this and book the test.
          </span>
        </li>
      </ol>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1.1rem", gap: "1rem" }}>
        <p className="muted" style={{ margin: 0 }}>
          No streaks. No scores. The exit is the point.
        </p>
        <span className="stamp">
          24 questions
          <br />
          pass at 18
        </span>
      </div>
      <div style={{ marginTop: "1.1rem" }}>
        <button className="btn primary" onClick={() => dispatch({ type: "SPEED_START" })}>
          Start the fast pass
        </button>
      </div>
    </Screen>
  );
}

export function SpeedScreen({ bank, state, dispatch }: ScreenProps) {
  if (state.screen.kind !== "speed" && state.screen.kind !== "recheck") return null;
  const { factId, index, total } = state.screen;
  const fact = factById(bank, factId);
  const isRecheck = state.screen.kind === "recheck";
  const mark = (knew: boolean) =>
    dispatch(isRecheck ? { type: "RECHECK_MARK", knew } : { type: "SPEED_MARK", knew });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1") mark(true);
      if (e.key === "2") mark(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <Screen>
      <Hairline frac={(index + 1) / total} />
      <p className="muted small" style={{ margin: "0.6rem 0 0", textAlign: "right" }}>
        {index + 1} / {total}
      </p>
      <div className="spacer" />
      <div key={factId} className="speed-item speed-card">
        <p className="stem" style={{ textAlign: "center", margin: 0 }}>
          <Bold text={fact.statement} />
        </p>
      </div>
      <div style={{ marginTop: "1.1rem" }}>
        <button className="btn" onClick={() => mark(true)}>
          Knew it <span className="muted small" aria-hidden="true">&nbsp;(1)</span>
        </button>
        <button className="btn" onClick={() => mark(false)}>
          Not sure <span className="muted small" aria-hidden="true">&nbsp;(2)</span>
        </button>
      </div>
      <div className="spacer" />
    </Screen>
  );
}

export function PhaseBridgeScreen({ state, dispatch }: ScreenProps) {
  const removed = state.ledger.claimed.length;
  return (
    <Screen center>
      <h1 className="title">We've taken {removed} things off your list.</h1>
      <p className="muted">You'll never see them again — unless we need to double-check one.</p>
      <Meter view={meterView(state)} responsesSeen={state.responsesSeen} />
      <div style={{ marginTop: "1.25rem" }}>
        <button className="btn primary" onClick={() => dispatch({ type: "BRIDGE_DONE" })}>
          Start practising
        </button>
      </div>
    </Screen>
  );
}

export function HomeScreen({ bank, state, dispatch }: ScreenProps) {
  const view = meterView(state);
  const target = state.setup?.targetPct ?? 95;
  const atTarget = state.meter.unlocked && (state.meter.lastShownPct ?? 0) >= target;
  return (
    <Screen>
      <div style={{ margin: "0.5rem 0 1.25rem" }}>
        <Meter view={view} responsesSeen={state.responsesSeen} />
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Target: {target}% chance of passing before we tell you to stop.
      </p>
      <div className="spacer" />
      <button className="btn primary" onClick={() => dispatch({ type: "BLOCK_START" })}>
        {state.blockNo === 0 ? "Start a 7-minute block" : "Another 7-minute block"}
      </button>
      <button className="btn" onClick={() => dispatch({ type: "MOCK_START", which: null })}>
        Sit a full mock (24 questions)
      </button>
      {state.stopShownAt != null && !state.outcome && (
        <button className="btn quiet" onClick={() => dispatch({ type: "GO_OUTCOME" })}>
          Sat the test? Tell us how it went
        </button>
      )}
      {atTarget && (
        <p className="notice" style={{ marginTop: "0.75rem" }}>
          You're at your target. More studying isn't a good use of your time —{" "}
          <a href={BOOKING_URL} target="_blank" rel="noreferrer">
            book the test
          </a>
          .
        </p>
      )}
      <p className="muted small" style={{ textAlign: "center", marginTop: "1rem" }}>
        {bank.facts.length} facts from 17 practice exams · no streaks, no lives — we want you gone
      </p>
    </Screen>
  );
}

export function DrillScreen({ bank, state, dispatch }: ScreenProps) {
  if (state.screen.kind !== "drill") return null;
  const { factId, variantId, showingCard } = state.screen;
  const fact = factById(bank, factId);
  const variant = variantById(bank, factId, variantId);
  if (showingCard) {
    return (
      <Screen>
        <div className="spacer" />
        <MemoryCard bank={bank} fact={fact} onGotIt={() => dispatch({ type: "CARD_GOT_IT" })} />
        <div className="spacer" />
      </Screen>
    );
  }
  return (
    <Screen>
      <Question
        // key remounts the component per serving — answer state (locked,
        // selection) must never leak from one question into the next
        key={`${state.queue.cursor}:${variant.id}`}
        variant={variant}
        seed={state.seed}
        serial={state.queue.cursor}
        showFeedback={true}
        progressFrac={Math.min(1, state.blockSecondsUsed / TUNING.BLOCK_SECONDS)}
        onAnswer={(r) =>
          dispatch({ type: "DRILL_ANSWER", variantId: variant.id, optionIdx: r.optionIdx, notSure: r.notSure })
        }
      />
    </Screen>
  );
}

export function BlockSummaryScreen({ state, dispatch }: ScreenProps) {
  if (state.screen.kind !== "block_summary") return null;
  const view = meterView(state);
  const from = state.screen.fromPct;
  const to = state.meter.lastShownPct;
  const justUnlocked = state.meter.unlocked && from == null && to != null;
  return (
    <Screen center>
      <h1 className="title">That's {Math.round(TUNING.BLOCK_SECONDS / 60)} minutes.</h1>
      {from != null && to != null && to !== from && (
        <p className="muted">
          You moved from {from}% to {to}%.
        </p>
      )}
      {justUnlocked && <p className="muted">We know you well enough now to be honest:</p>}
      <Meter view={view} responsesSeen={state.responsesSeen} celebrate={justUnlocked} />
      <div style={{ marginTop: "1.25rem" }}>
        <button className="btn primary" onClick={() => dispatch({ type: "BLOCK_DONE_ACK" })}>
          Continue
        </button>
      </div>
    </Screen>
  );
}

export function MockIntroScreen({ state, dispatch }: ScreenProps) {
  const which = state.screen.kind === "mock_intro" ? state.screen.which : null;
  return (
    <Screen center>
      <h1 className="title">{which === 1 ? "Time for a real test run." : "A full mock."}</h1>
      <p>
        24 questions, the real format, no feedback until the end. You need 18 to pass. It takes about
        15 minutes.
      </p>
      {which === 1 && <p className="muted">Your number is high enough that this is worth seeing for real.</p>}
      <div style={{ marginTop: "1.25rem" }}>
        <button className="btn primary" onClick={() => dispatch({ type: "MOCK_START", which })}>
          Start the mock
        </button>
        <button className="btn quiet" onClick={() => dispatch({ type: "GO_HOME" })}>
          Later
        </button>
      </div>
    </Screen>
  );
}

export function MockScreen({ bank, state, dispatch }: ScreenProps) {
  if (state.screen.kind !== "mock" || !state.activeMock) return null;
  const { index, total } = state.screen;
  const item = state.activeMock.items[index];
  const variant = variantById(bank, item.factId, item.variantId);
  return (
    <Screen>
      <p className="muted small" style={{ margin: "0 0 0.4rem" }}>
        Question {index + 1} of {total}
      </p>
      <Question
        key={`mock${state.mocks.length}:${index}:${variant.id}`}
        variant={variant}
        seed={state.seed}
        serial={1000 + state.mocks.length * 100 + index}
        showFeedback={false}
        progressFrac={null}
        onAnswer={(r) => dispatch({ type: "MOCK_ANSWER", variantId: variant.id, optionIdx: r.optionIdx })}
      />
    </Screen>
  );
}

export function MockResultsScreen({ bank, state, dispatch }: ScreenProps) {
  if (state.screen.kind !== "mock_results") return null;
  const mock = state.mocks[state.screen.mockIndex];
  const missed = mock.items.filter((_, i) => !mock.results[i]);
  return (
    <Screen>
      <h1 className="title">
        {mock.score} of 24 — {mock.passed ? "a pass" : "not a pass yet"}
      </h1>
      <p className="muted">The pass line is 18. {missed.length > 0 ? "What you missed goes to the front of your queue." : "Clean sheet."}</p>
      {missed.map((m) => {
        const fact = factById(bank, m.factId);
        return (
          <div key={m.factId} style={{ margin: "0.75rem 0" }}>
            <p className="fact" style={{ fontFamily: "var(--serif)", margin: 0 }}>
              <Bold text={fact.statement} />
            </p>
          </div>
        );
      })}
      <div style={{ marginTop: "1.25rem" }}>
        <button className="btn primary" onClick={() => dispatch({ type: "MOCK_RESULTS_ACK" })}>
          Continue
        </button>
      </div>
    </Screen>
  );
}

export function ReadyScreen({ state, dispatch }: ScreenProps) {
  const pct = state.meter.lastShownPct ?? state.setup?.targetPct ?? 95;
  return (
    <Screen center>
      <h1 className="title" style={{ fontSize: "2rem" }}>
        You're ready.
      </h1>
      <div className="meter-number" style={{ margin: "0.5rem 0 1rem" }}>
        {pct}
        <span className="pct">%</span>
        <span style={{ fontFamily: "var(--sans)", fontSize: "1.05rem", color: "var(--ink-muted)", marginLeft: 8 }}>
          chance of passing
        </span>
      </div>
      <p>More studying isn't a good use of your time. Go book it.</p>
      <div style={{ marginTop: "1rem" }}>
        <a className="btn primary" style={{ textDecoration: "none" }} href={BOOKING_URL} target="_blank" rel="noreferrer">
          Book the test ↗
        </a>
        <button className="btn quiet" onClick={() => dispatch({ type: "KEEP_GOING" })}>
          I'd rather keep going
        </button>
      </div>
    </Screen>
  );
}

export function KeepGoingScreen({ state, dispatch }: ScreenProps) {
  const pct = state.meter.lastShownPct ?? 95;
  const next = Math.min(TUNING.METER_CAP, pct + 2);
  return (
    <Screen center>
      <p>
        Another 20 minutes would take you from about {pct}% to about {next}%. Your call.
      </p>
      <div style={{ marginTop: "1rem" }}>
        <button className="btn primary" onClick={() => dispatch({ type: "BLOCK_START" })}>
          One more block
        </button>
        <button className="btn quiet" onClick={() => dispatch({ type: "GO_HOME" })}>
          Home
        </button>
      </div>
    </Screen>
  );
}

export function RecheckGateScreen({ state, dispatch }: ScreenProps) {
  void state;
  void dispatch;
  return null; // recheck items render through SpeedScreen
}

export function OutcomeScreen({ dispatch }: ScreenProps) {
  return (
    <Screen center>
      <h1 className="title">How did it go?</h1>
      <div className="pill-choice" style={{ marginTop: "1rem" }}>
        <button className="btn" onClick={() => dispatch({ type: "OUTCOME_REPORT", result: "passed" })}>
          Passed
        </button>
        <button className="btn" onClick={() => dispatch({ type: "OUTCOME_REPORT", result: "failed" })}>
          Didn't pass
        </button>
        <button className="btn quiet" onClick={() => dispatch({ type: "OUTCOME_REPORT", result: "not_yet" })}>
          Haven't sat it yet
        </button>
      </div>
    </Screen>
  );
}

export function DoneScreen(_: ScreenProps) {
  return (
    <Screen center>
      <h1 className="title">That's it.</h1>
      <p>Congratulations. Delete us whenever — that was the point.</p>
    </Screen>
  );
}

export function screenFor(kind: MachineScreen["kind"]) {
  switch (kind) {
    case "intro":
      return IntroScreen;
    case "speed":
    case "recheck":
      return SpeedScreen;
    case "phase_bridge":
      return PhaseBridgeScreen;
    case "home":
    case "drill_intro":
      return HomeScreen;
    case "drill":
      return DrillScreen;
    case "block_summary":
      return BlockSummaryScreen;
    case "mock_intro":
      return MockIntroScreen;
    case "mock":
      return MockScreen;
    case "mock_results":
      return MockResultsScreen;
    case "ready":
      return ReadyScreen;
    case "keep_going":
      return KeepGoingScreen;
    case "outcome":
      return OutcomeScreen;
    case "done":
      return DoneScreen;
  }
}
