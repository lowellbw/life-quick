/**
 * jsdom smoke: click through setup -> speed round (few items) -> drill with a
 * deliberate wrong answer -> memory card (amber, never red) -> got it.
 * Renders screens directly against the real reducer.
 */
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import bankJson from "../../src/content/bank.json";
import type { Bank } from "../../src/content/types";
import { initialState, reduce, variantById, type Event, type UiEvent, type UserState } from "../../src/session/machine";
import { screenFor } from "../../src/ui/screens";

const bank = bankJson as unknown as Bank;

/** Tiny external store so tests can drive the reducer from outside React too. */
function makeStore(seed: number) {
  let state = initialState(seed, 1_700_000_000_000);
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    dispatch(partial: UiEvent) {
      const ev = { ...partial, nowMs: partial.nowMs ?? 1_700_000_000_000 } as Event;
      state = reduce(state, ev, bank);
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
type Store = ReturnType<typeof makeStore>;

function Harness({ store }: { store: Store }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const Active = screenFor(state.screen.kind);
  return <Active bank={bank} state={state} dispatch={store.dispatch} />;
}

describe("ui smoke", () => {
  it("walks setup -> speed -> drill -> wrong answer -> amber card -> got it", async () => {
    const store = makeStore(42);
    render(<Harness store={store} />);

    // setup: skip date, studied a little, retake annoying
    fireEvent.click(screen.getByText("I haven't booked yet"));
    fireEvent.click(screen.getByText("A little"));
    fireEvent.click(screen.getByText("I'd rather not"));
    expect(store.get().setup?.targetPct).toBe(95);

    // speed intro -> speed
    fireEvent.click(screen.getByText("Start"));
    expect(store.get().screen.kind).toBe("speed");

    // mark 5 items via the UI
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByText(/Knew it/));
    }
    expect(store.get().responsesSeen).toBe(5);

    // exhaust the rest of the speed round through the store (fast path)
    act(() => {
      while (store.get().screen.kind === "speed") {
        store.dispatch({ type: "SPEED_MARK", knew: false });
      }
    });
    fireEvent.click(screen.getByText("Start practising"));
    expect(store.get().screen.kind).toBe("home");
    fireEvent.click(screen.getByText(/Start a 7-minute block/));
    expect(store.get().screen.kind).toBe("drill");

    // answer WRONG on purpose: find a non-answer option and click it
    const scr = store.get().screen;
    if (scr.kind !== "drill") throw new Error("expected drill");
    const variant = variantById(bank, scr.factId, scr.variantId);
    const wrongIdx = variant.options.findIndex((_, i) => !variant.answerIdx.includes(i));
    const wrongText = variant.options[wrongIdx];
    fireEvent.click(screen.getByText(wrongText));

    // option settles into amber (data-state="wrong"), never a red class
    const wrongBtn = screen.getByText(wrongText).closest("button")!;
    expect(wrongBtn.getAttribute("data-state")).toBe("wrong");
    expect(document.body.innerHTML).not.toMatch(/#e11|#f44|#dc2|crimson|\bred\b/i);

    // after the settle delay the reducer flips to the card
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(store.get().screen.kind).toBe("drill");
    const drillScr = store.get().screen;
    if (drillScr.kind === "drill") expect(drillScr.showingCard).toBe(true);

    // memory card visible with Got it
    fireEvent.click(screen.getByText("Got it"));
    const after = store.get().screen;
    if (after.kind === "drill") expect(after.showingCard).toBe(false);
    cleanup();
  });

  it("a CORRECT answer serves the next question with fresh, enabled options", async () => {
    // regression: Question must remount per serving — locked state leaking
    // from a correct answer froze the next question with disabled options
    const store = makeStore(101);
    act(() => {
      store.dispatch({ type: "SETUP_ANSWER", step: 0, value: "" });
      store.dispatch({ type: "SETUP_ANSWER", step: 1, value: "no" });
      store.dispatch({ type: "SETUP_ANSWER", step: 2, value: "annoying" });
      store.dispatch({ type: "SPEED_START" });
      while (store.get().screen.kind === "speed") store.dispatch({ type: "SPEED_MARK", knew: false });
      store.dispatch({ type: "BRIDGE_DONE" });
      store.dispatch({ type: "BLOCK_START" });
    });
    render(<Harness store={store} />);
    const scr = store.get().screen;
    if (scr.kind !== "drill") throw new Error("expected drill");
    const variant = variantById(bank, scr.factId, scr.variantId);
    const rightText = variant.options[variant.answerIdx[0]];
    fireEvent.click(screen.getByText(rightText));
    // wait past the settle delay
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    const scr2 = store.get().screen;
    expect(scr2.kind).toBe("drill");
    if (scr2.kind === "drill") {
      expect(scr2.variantId).not.toBe(scr.variantId); // advanced
      expect(scr2.showingCard).toBe(false);
    }
    // the freshly served question's options must be enabled
    const enabled = Array.from(document.querySelectorAll(".option:not([disabled])"));
    expect(enabled.length).toBeGreaterThanOrEqual(2);
    cleanup();
  });

  it("evidence and audit ledger reflect speed-round claims", () => {
    let s: UserState = initialState(7, 1_700_000_000_000);
    const step = (e: Event) => (s = reduce(s, e, bank));
    step({ type: "SETUP_ANSWER", step: 0, value: "", nowMs: 0 });
    step({ type: "SETUP_ANSWER", step: 1, value: "no", nowMs: 0 });
    step({ type: "SETUP_ANSWER", step: 2, value: "disaster", nowMs: 0 });
    expect(s.setup?.targetPct).toBe(98);
    step({ type: "SPEED_START", nowMs: 0 });
    step({ type: "SPEED_MARK", knew: true, nowMs: 0 });
    step({ type: "SPEED_MARK", knew: false, nowMs: 0 });
    expect(s.ledger.claimed.length).toBe(1);
    expect(Object.keys(s.evidence).length).toBe(2);
  });
});
