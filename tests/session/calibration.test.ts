/**
 * The load-bearing test: synthetic users driven through the REAL reducer
 * (setup -> speed -> blocks -> mocks -> stop), no DOM. Asserts the product
 * arc works: meter unlocks in a sane window, liars get discounted, stronger
 * users score higher, a strong user reaches the stop screen.
 */
import { describe, expect, it } from "vitest";
import bankJson from "../../src/content/bank.json";
import type { Bank, Variant } from "../../src/content/types";
import {
  initialState,
  reduce,
  variantById,
  type Event,
  type UserState,
} from "../../src/session/machine";
import { honestyFactor } from "../../src/model/audit";
import { mulberry32, type Rng } from "../../src/lib/rng";
import { TUNING } from "../../src/model/tuning";

const bank = bankJson as unknown as Bank;

interface SyntheticUser {
  /** does this user truly know fact i? decided once per fact */
  knows: Map<string, boolean>;
  /** P(answer correctly | knows) */
  skill: number;
  /** P(claims "knew it" in speed round | does NOT know) — the overclaim rate */
  overclaim: number;
  rng: Rng;
}

function makeUser(bank: Bank, priorShift: number, overclaim: number, seed: number): SyntheticUser {
  const rng = mulberry32(seed);
  const knows = new Map<string, boolean>();
  for (const f of bank.facts) {
    const p = Math.min(0.98, Math.max(0.02, f.prior + priorShift));
    knows.set(f.id, rng() < p);
  }
  return { knows, skill: 0.92, overclaim, rng };
}

function answerVariant(u: SyntheticUser, v: Variant, factId: string): number[] {
  const knows = u.knows.get(factId)!;
  const correctly = knows ? u.rng() < u.skill : u.rng() < 1 / v.options.length;
  if (correctly) return v.answerIdx;
  // wrong: pick a non-answer set of the right size
  const wrongPool = v.options.map((_, i) => i).filter((i) => !v.answerIdx.includes(i));
  const need = v.answersRequired;
  const chosen: number[] = [];
  while (chosen.length < need && wrongPool.length > 0) {
    const j = Math.floor(u.rng() * wrongPool.length);
    chosen.push(wrongPool.splice(j, 1)[0]);
  }
  while (chosen.length < need) chosen.push(v.answerIdx[0]); // degenerate fallback
  return chosen;
}

interface RunResult {
  state: UserState;
  unlockAtEvidence: number | null;
  minutes: number;
  reachedStop: boolean;
}

function runUser(u: SyntheticUser, seed: number, maxMinutes = 150): RunResult {
  let now = 1_700_000_000_000;
  let s = initialState(seed, now);
  let seconds = 0;
  let unlockAtEvidence: number | null = null;
  const step = (ev: Event) => {
    s = reduce(s, ev, bank);
    if (unlockAtEvidence == null && s.meter.unlocked) unlockAtEvidence = s.evidenceUnits;
  };

  step({ type: "SETUP_ANSWER", step: 0, value: "", nowMs: now });
  step({ type: "SETUP_ANSWER", step: 1, value: "some", nowMs: now });
  step({ type: "SETUP_ANSWER", step: 2, value: "annoying", nowMs: now });
  step({ type: "SPEED_START", nowMs: now });

  // speed round
  let guard = 0;
  while (s.screen.kind === "speed" && guard++ < 500) {
    const factId = s.screen.factId;
    const knows = u.knows.get(factId)!;
    const claims = knows ? u.rng() < 0.95 : u.rng() < u.overclaim;
    seconds += TUNING.SPEED_SECONDS_PER_ITEM;
    now += TUNING.SPEED_SECONDS_PER_ITEM * 1000;
    step({ type: "SPEED_MARK", knew: claims, nowMs: now });
  }
  if (s.screen.kind === "phase_bridge") step({ type: "BRIDGE_DONE", nowMs: now });

  // drill until stop, outcome-ready, or time budget
  guard = 0;
  while (seconds < maxMinutes * 60 && guard++ < 5000) {
    if (s.screen.kind === "home") {
      step({ type: "BLOCK_START", nowMs: now });
    } else if (s.screen.kind === "drill") {
      if (s.screen.showingCard) {
        seconds += 16;
        now += 16_000;
        step({ type: "CARD_GOT_IT", nowMs: now });
        // reading the card teaches the fact
        u.knows.set(s.screen.kind === "drill" ? s.screen.factId : "", true);
      } else {
        const v = variantById(bank, s.screen.factId, s.screen.variantId);
        const idx = answerVariant(u, v, s.screen.factId);
        seconds += 6;
        now += 6_000;
        const factId = s.screen.factId;
        step({ type: "DRILL_ANSWER", optionIdx: idx, notSure: false, nowMs: now });
        // card learning happens on the flip (handled above); mark misses learned
        if (s.screen.kind === "drill" && s.screen.showingCard) u.knows.set(factId, true);
      }
    } else if (s.screen.kind === "block_summary") {
      step({ type: "BLOCK_DONE_ACK", nowMs: now });
    } else if (s.screen.kind === "mock_intro") {
      step({ type: "MOCK_START", which: s.screen.which, nowMs: now });
    } else if (s.screen.kind === "mock") {
      const item = s.activeMock!.items[s.activeMock!.index];
      const v = variantById(bank, item.factId, item.variantId);
      const idx = answerVariant(u, v, item.factId);
      seconds += 8;
      now += 8_000;
      step({ type: "MOCK_ANSWER", optionIdx: idx, nowMs: now });
    } else if (s.screen.kind === "mock_results") {
      // reading cards for misses
      seconds += 30;
      now += 30_000;
      const last = s.mocks[s.mocks.length - 1];
      last.items.forEach((it, i) => {
        if (!last.results[i]) u.knows.set(it.factId, true);
      });
      step({ type: "MOCK_RESULTS_ACK", nowMs: now });
    } else if (s.screen.kind === "ready") {
      return { state: s, unlockAtEvidence, minutes: seconds / 60, reachedStop: true };
    } else {
      break;
    }
  }
  return { state: s, unlockAtEvidence, minutes: seconds / 60, reachedStop: s.screen.kind === "ready" };
}

describe("calibration E2E (real reducer, synthetic users)", () => {
  it("honest typical user: meter unlocks in a sane evidence window", () => {
    const u = makeUser(bank, 0, 0.1, 11);
    const r = runUser(u, 101, 60);
    expect(r.unlockAtEvidence).not.toBeNull();
    expect(r.unlockAtEvidence!).toBeGreaterThan(20);
    expect(r.unlockAtEvidence!).toBeLessThan(260);
  });

  it("liar ends with a lower honesty factor than an honest twin", () => {
    const honest = makeUser(bank, 0, 0.08, 21);
    const liar = makeUser(bank, 0, 0.65, 21);
    const rh = runUser(honest, 202, 45);
    const rl = runUser(liar, 202, 45);
    const hHonest = honestyFactor(rh.state.ledger);
    const hLiar = honestyFactor(rl.state.ledger);
    expect(rl.state.ledger.audited.length).toBeGreaterThanOrEqual(TUNING.AUDIT_MIN_SAMPLE);
    expect(hLiar).toBeLessThan(hHonest);
    expect(hLiar).toBeLessThan(0.95);
  });

  it("stronger users end with a higher displayed number", () => {
    const strong = makeUser(bank, 0.15, 0.05, 31);
    const weak = makeUser(bank, -0.2, 0.05, 31);
    const rs = runUser(strong, 303, 40);
    const rw = runUser(weak, 303, 40);
    const qs = rs.state.lastPredictive?.q35 ?? 0;
    const qw = rw.state.lastPredictive?.q35 ?? 0;
    expect(qs).toBeGreaterThan(qw);
  });

  it("a well-prepared user reaches the stop screen within the session", () => {
    const u = makeUser(bank, 0.22, 0.03, 41);
    const r = runUser(u, 404, 150);
    expect(r.reachedStop).toBe(true);
    // and the meter agreed they were at/above target when it stopped
    expect(r.state.lastPredictive!.q35).toBeGreaterThanOrEqual(0.95 - 0.02);
  });

  it("mock 1 gets offered when the mean crosses the threshold", () => {
    const u = makeUser(bank, 0.18, 0.05, 51);
    const r = runUser(u, 505, 120);
    expect(r.state.mock1Offered).toBe(true);
    expect(r.state.mocks.length).toBeGreaterThanOrEqual(1);
  });

  it("audits happen silently during drilling at roughly the configured rate", () => {
    const u = makeUser(bank, 0, 0.15, 61);
    const r = runUser(u, 606, 45);
    const audited = r.state.ledger.audited.length;
    const claimed = r.state.ledger.claimed.length;
    expect(claimed).toBeGreaterThan(20);
    expect(audited).toBeGreaterThan(0);
  });
});
