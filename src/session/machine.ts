/**
 * The session state machine — one pure reducer over the whole product arc:
 *
 *   setup -> speed round -> drill blocks (with silent audits) -> meter unlock
 *   -> mock 1 (~80% mean) -> more drilling -> mock 2 (near target) -> stop
 *   -> outcome, with the decay + recheck gate on returns.
 *
 * Pure and deterministic given (state, event, clock, bank): every random
 * choice draws from named substreams of the user's seed. UI renders states;
 * it never owns logic.
 */
import type { Bank, Fact, Variant } from "../content/types";
import { TUNING, type RetakePain, type StudiedBefore } from "../model/tuning";
import {
  applyEvent,
  emptyEvidence,
  eventOutcome,
  eventWeight,
  posterior,
  type AnswerKind,
  type FactEvidence,
} from "../model/evidence";
import { emptyAuditLedger, honestyFactor, type AuditLedger } from "../model/audit";
import { effectiveP, initialAbility, updateAbility, type Ability } from "../model/ability";
import { decayAbility, decayEvidence, decayShrink } from "../model/decay";
import { predictive, type Predictive } from "../model/passSim";
import { advanceMeter, armDrop, emptyMeter, type MeterState, type MeterView } from "../model/meter";
import {
  advanceCursor,
  emptyQueue,
  removeRepeat,
  scheduleAfterLadderCorrect,
  scheduleAfterMiss,
  scheduleAtFront,
  type QueueState,
} from "../scheduler/queue";
import { serveNext, servingSeconds, type ServeContext } from "../scheduler/blocks";
import { emptyCadence, type AuditCadence } from "../scheduler/audits";
import { speedPool } from "../scheduler/speedRound";
import { mockScore, pickVariant, sampleMock, type MockItem } from "../scheduler/mocks";
import { substream, shuffled } from "../lib/rng";
import { DAY_MS } from "../lib/time";

// ------------------------------------------------------------------ types

export type Screen =
  | { kind: "intro" }
  | { kind: "speed"; factId: string; index: number; total: number }
  | { kind: "phase_bridge" }
  | { kind: "home" }
  | { kind: "drill_intro" }
  | {
      kind: "drill";
      factId: string;
      variantId: string;
      isAudit: boolean;
      showingCard: boolean;
      wasCorrect: boolean | null;
      itemsServed: number;
    }
  | { kind: "block_summary"; blockNo: number; fromPct: number | null }
  | { kind: "mock_intro"; which: 1 | 2 | null }
  | { kind: "mock"; index: number; total: number }
  | { kind: "mock_results"; mockIndex: number }
  | { kind: "ready" }
  | { kind: "keep_going" }
  | { kind: "recheck"; factId: string; index: number; total: number }
  | { kind: "outcome" }
  | { kind: "done" };

export interface SetupState {
  testDateISO: string | null;
  studiedBefore: StudiedBefore;
  retakePain: RetakePain;
  targetPct: 90 | 95 | 98;
}

export interface MockRecord {
  at: number;
  items: MockItem[];
  results: boolean[]; // per item
  score: number;
  passed: boolean;
}

export interface UserState {
  seed: number;
  createdAt: number;
  lastActiveAt: number;
  setup: SetupState;
  screen: Screen;

  speedOrder: string[];
  speedIndex: number;

  evidence: Record<string, FactEvidence>;
  ability: Ability;
  ledger: AuditLedger;
  queue: QueueState;
  cadence: AuditCadence;

  /** total evidence weight observed (meter N and ramp) */
  evidenceUnits: number;
  /** raw count of things we've seen the user answer/declare */
  responsesSeen: number;

  meter: MeterState;
  lastPredictive: Predictive | null;
  predictiveRecomputes: number;

  blockNo: number;
  blockSecondsUsed: number;
  servedInBlock: string[];
  missedInBlock: string[];
  /** pct shown at the start of the current block (for "71% -> 78%" copy) */
  blockStartPct: number | null;

  mocks: MockRecord[];
  activeMock: { items: MockItem[]; results: boolean[]; index: number; which: 1 | 2 | null } | null;
  mock1Offered: boolean;

  stopShownAt: number | null;
  keepGoingChosen: boolean;

  recheck: { order: string[]; index: number } | null;

  outcome: { result: "passed" | "failed" | "not_yet"; at: number } | null;
}

/** Omit that distributes over a union (plain Omit collapses discriminated unions). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** What the UI dispatches — the reducer's Event minus the clock, which App injects. */
export type UiEvent = DistributiveOmit<Event, "nowMs"> & { nowMs?: number };

export type Event =
  | { type: "BOOT"; nowMs: number }
  | { type: "SPEED_START"; nowMs: number }
  | { type: "SPEED_MARK"; knew: boolean; nowMs: number }
  | { type: "BRIDGE_DONE"; nowMs: number }
  | { type: "BLOCK_START"; nowMs: number }
  | { type: "DRILL_ANSWER"; variantId?: string; optionIdx: number[]; notSure: boolean; nowMs: number }
  | { type: "CARD_GOT_IT"; nowMs: number }
  | { type: "BLOCK_DONE_ACK"; nowMs: number }
  | { type: "MOCK_START"; which: 1 | 2 | null; nowMs: number }
  | { type: "MOCK_ANSWER"; variantId?: string; optionIdx: number[]; nowMs: number }
  | { type: "MOCK_RESULTS_ACK"; nowMs: number }
  | { type: "GO_HOME"; nowMs: number }
  | { type: "GO_OUTCOME"; nowMs: number }
  | { type: "RESET_ALL"; seed: number; nowMs: number }
  | { type: "KEEP_GOING"; nowMs: number }
  | { type: "RECHECK_MARK"; knew: boolean; nowMs: number }
  | { type: "OUTCOME_REPORT"; result: "passed" | "failed" | "not_yet"; nowMs: number };

// ------------------------------------------------------------------ helpers

export function initialState(seed: number, nowMs: number): UserState {
  return {
    seed,
    createdAt: nowMs,
    lastActiveAt: nowMs,
    // No setup questionnaire: sensible defaults, adjustable later in settings.
    setup: { testDateISO: null, studiedBefore: "some", retakePain: "annoying", targetPct: 95 },
    screen: { kind: "intro" },
    speedOrder: [],
    speedIndex: 0,
    evidence: {},
    ability: initialAbility("some"),
    ledger: emptyAuditLedger(),
    queue: emptyQueue(),
    cadence: emptyCadence(),
    evidenceUnits: 0,
    responsesSeen: 0,
    meter: emptyMeter(),
    lastPredictive: null,
    predictiveRecomputes: 0,
    blockNo: 0,
    blockSecondsUsed: 0,
    servedInBlock: [],
    missedInBlock: [],
    blockStartPct: null,
    mocks: [],
    activeMock: null,
    mock1Offered: false,
    stopShownAt: null,
    keepGoingChosen: false,
    recheck: null,
    outcome: null,
  };
}

export function factById(bank: Bank, id: string): Fact {
  const f = bank.facts.find((x) => x.id === id);
  if (!f) throw new Error(`unknown fact ${id}`);
  return f;
}

export function variantById(bank: Bank, factId: string, variantId: string): Variant {
  const f = factById(bank, factId);
  const v = f.variants.find((x) => x.id === variantId);
  if (!v) throw new Error(`unknown variant ${variantId}`);
  return v;
}

function serveCtx(bank: Bank, s: UserState): ServeContext {
  return {
    bank,
    evidence: s.evidence,
    ability: s.ability,
    honesty: honestyFactor(s.ledger),
    queue: s.queue,
    cadence: s.cadence,
    ledger: s.ledger,
    servedInBlock: s.servedInBlock,
    missedInBlock: s.missedInBlock,
    rng: substream(s.seed, "serve", s.queue.cursor),
  };
}

function recordEvidence(s: UserState, bank: Bank, factId: string, kind: AnswerKind, nowMs: number): UserState {
  const h = honestyFactor(s.ledger);
  const fact = factById(bank, factId);
  const prev = s.evidence[factId] ?? emptyEvidence();
  const postMean = posterior(fact.prior, prev, h).mean;
  const pPred = effectiveP(postMean, s.ability);
  const w = eventWeight(kind, h);
  const x = eventOutcome(kind);
  const nextEv = applyEvent(prev, kind, nowMs);
  return {
    ...s,
    evidence: { ...s.evidence, [factId]: nextEv },
    ability: updateAbility(s.ability, x, pPred, w),
    evidenceUnits: s.evidenceUnits + w,
    responsesSeen: s.responsesSeen + 1,
    lastActiveAt: nowMs,
  };
}

/** Recompute the predictive + meter. Done at block boundaries, mocks, recheck. */
function recompute(s: UserState, bank: Bank): UserState {
  const pred = predictive(
    { bank, evidence: s.evidence, ability: s.ability, honesty: honestyFactor(s.ledger) },
    s.seed,
    s.predictiveRecomputes,
  );
  const { meter } = advanceMeter(s.meter, pred, s.evidenceUnits);
  return { ...s, lastPredictive: pred, meter, predictiveRecomputes: s.predictiveRecomputes + 1 };
}

export function meterView(s: UserState): MeterView | null {
  if (!s.lastPredictive) return null;
  // advanceMeter is pure; re-derive the view from the stored state without advancing
  const { view } = advanceMeter(s.meter, s.lastPredictive, s.evidenceUnits);
  return view;
}

function shownPct(s: UserState): number | null {
  return s.meter.unlocked ? s.meter.lastShownPct : null;
}

/** Should we offer mock 1 / mock 2 / the stop screen right now? */
function arcCheck(s: UserState): "mock1" | "mock2" | "stop" | null {
  const pred = s.lastPredictive;
  const setup = s.setup;
  if (!pred || !setup) return null;
  const target = setup.targetPct / 100;
  if (s.meter.unlocked && pred.q35 >= target && s.stopShownAt == null) return "stop";
  if (!s.mock1Offered && pred.mean >= TUNING.MOCK1_MEAN_THRESHOLD) return "mock1";
  const nearTarget = s.meter.unlocked && pred.q35 >= target - TUNING.MOCK2_WITHIN_PTS / 100;
  if (nearTarget && s.mocks.length === 1 && !s.activeMock) return "mock2";
  return null;
}

function startDrillItem(s: UserState, bank: Bank): UserState {
  const decision = serveNext(serveCtx(bank, s));
  if (!decision) {
    // bank exhausted for this block — close the block
    return endBlock(s, bank);
  }
  const fact = factById(bank, decision.factId);
  const variant = pickVariant(fact, s.evidence[decision.factId]);
  const cadence = decision.isAudit ? { sinceLast: 0 } : { sinceLast: s.cadence.sinceLast + 1 };
  let queue = s.queue;
  if (decision.isRepeat) queue = removeRepeat(queue, decision.factId);
  return {
    ...s,
    cadence,
    queue,
    screen: {
      kind: "drill",
      factId: decision.factId,
      variantId: variant.id,
      isAudit: decision.isAudit,
      showingCard: false,
      wasCorrect: null,
      itemsServed: s.servedInBlock.length,
    },
  };
}

function endBlock(s: UserState, bank: Bank): UserState {
  let next = recompute(s, bank);
  next = {
    ...next,
    screen: { kind: "block_summary", blockNo: next.blockNo, fromPct: s.blockStartPct },
    blockSecondsUsed: 0,
    servedInBlock: [],
    missedInBlock: [],
  };
  return next;
}

/** Answer correctness for a variant given chosen option indices. */
export function isAnswerCorrect(variant: Variant, chosen: number[]): boolean {
  if (chosen.length !== variant.answerIdx.length) return false;
  const want = [...variant.answerIdx].sort((a, b) => a - b);
  const got = [...chosen].sort((a, b) => a - b);
  return want.every((w, i) => w === got[i]);
}

// ------------------------------------------------------------------ reducer

export function reduce(s: UserState, ev: Event, bank: Bank): UserState {
  switch (ev.type) {
    case "BOOT": {
      if (s.screen.kind === "intro") return s; // not started — nothing to decay or gate
      const gapDays = (ev.nowMs - s.lastActiveAt) / DAY_MS;
      const shrink = decayShrink(gapDays);
      let next = s;
      if (shrink < 1) {
        const evidence: Record<string, FactEvidence> = {};
        for (const [id, e] of Object.entries(s.evidence)) evidence[id] = decayEvidence(e, shrink);
        next = {
          ...s,
          evidence,
          ability: decayAbility(s.ability, shrink),
          evidenceUnits: s.evidenceUnits * shrink,
          meter: armDrop(s.meter, "recheck"),
        };
        if (next.meter.unlocked) {
          // hide the number behind a short recheck of previously-strong facts
          const h = honestyFactor(next.ledger);
          const strong = bank.facts
            .filter((f) => {
              const e = next.evidence[f.id];
              if (!e) return false;
              return posterior(f.prior, e, h).mean >= 0.85;
            })
            .map((f) => f.id);
          const rng = substream(next.seed, "recheck", next.predictiveRecomputes);
          const order = shuffled(strong, rng).slice(0, TUNING.RECHECK_ITEMS);
          if (order.length >= 5) {
            return {
              ...next,
              recheck: { order, index: 0 },
              screen: { kind: "recheck", factId: order[0], index: 0, total: order.length },
              lastActiveAt: ev.nowMs,
            };
          }
        }
      }
      const screen: Screen = next.screen.kind === "speed" ? next.screen : { kind: "home" };
      return { ...next, screen, lastActiveAt: ev.nowMs };
    }

    case "SPEED_START": {
      const order = speedPool(bank, substream(s.seed, "speed", 0));
      return {
        ...s,
        speedOrder: order,
        speedIndex: 0,
        screen: { kind: "speed", factId: order[0], index: 0, total: order.length },
      };
    }

    case "SPEED_MARK": {
      const factId = s.speedOrder[s.speedIndex];
      let next = recordEvidence(s, bank, factId, ev.knew ? "speed_knew" : "speed_notsure", ev.nowMs);
      if (ev.knew) {
        next = { ...next, ledger: { ...next.ledger, claimed: [...next.ledger.claimed, factId] } };
      }
      const i = next.speedIndex + 1;
      if (i >= next.speedOrder.length) {
        next = recompute(next, bank);
        return { ...next, speedIndex: i, screen: { kind: "phase_bridge" } };
      }
      return {
        ...next,
        speedIndex: i,
        screen: { kind: "speed", factId: next.speedOrder[i], index: i, total: next.speedOrder.length },
      };
    }

    case "BRIDGE_DONE":
      return { ...s, screen: { kind: "home" } };

    case "BLOCK_START": {
      const next: UserState = {
        ...s,
        blockNo: s.blockNo + 1,
        blockSecondsUsed: 0,
        servedInBlock: [],
        missedInBlock: [],
        blockStartPct: shownPct(s),
        keepGoingChosen: s.keepGoingChosen,
      };
      return startDrillItem(next, bank);
    }

    case "DRILL_ANSWER": {
      if (s.screen.kind !== "drill" || s.screen.showingCard) return s;
      // stale-event guard: a late timer can't answer a question it wasn't asked
      if (ev.variantId && ev.variantId !== s.screen.variantId) return s;
      const { factId, variantId, isAudit } = s.screen;
      const variant = variantById(bank, factId, variantId);
      const correct = !ev.notSure && isAnswerCorrect(variant, ev.optionIdx);
      const kind: AnswerKind = ev.notSure
        ? "drill_notsure"
        : correct
          ? variant.format === "tf"
            ? "drill_correct_tf"
            : "drill_correct"
          : "drill_wrong";

      let next = recordEvidence(s, bank, factId, kind, ev.nowMs);

      // audit bookkeeping (silent)
      if (isAudit) {
        next = {
          ...next,
          ledger: { ...next.ledger, audited: [...next.ledger.audited, { factId, correct }] },
        };
      }

      // variant rotation for next serve
      const evd = next.evidence[factId];
      next = {
        ...next,
        evidence: { ...next.evidence, [factId]: { ...evd, variantCursor: evd.variantCursor + 1 } },
      };

      // queue movement
      let queue = advanceCursor(next.queue);
      const onLadder = next.queue.ladder[factId] != null;
      if (correct) {
        queue = onLadder ? scheduleAfterLadderCorrect({ ...queue }, factId) : queue;
      } else {
        queue = scheduleAfterMiss({ ...queue }, factId);
      }
      next = { ...next, queue };

      const servedInBlock = [...next.servedInBlock, factId];
      const missedInBlock = correct ? next.missedInBlock : [...next.missedInBlock, factId];
      const blockSecondsUsed = next.blockSecondsUsed + servingSeconds(correct);
      next = { ...next, servedInBlock, missedInBlock, blockSecondsUsed };

      if (!correct) {
        // flip to the card; block advances on CARD_GOT_IT
        return {
          ...next,
          screen: { ...s.screen, showingCard: true, wasCorrect: false },
        };
      }
      // correct → next item or end of block
      if (blockSecondsUsed >= TUNING.BLOCK_SECONDS) return endBlock(next, bank);
      return startDrillItem(next, bank);
    }

    case "CARD_GOT_IT": {
      if (s.screen.kind !== "drill" || !s.screen.showingCard) return s;
      if (s.blockSecondsUsed >= TUNING.BLOCK_SECONDS) return endBlock(s, bank);
      return startDrillItem(s, bank);
    }

    case "BLOCK_DONE_ACK": {
      const check = arcCheck(s);
      if (check === "stop") return { ...s, stopShownAt: ev.nowMs, screen: { kind: "ready" } };
      if (check === "mock1") return { ...s, mock1Offered: true, screen: { kind: "mock_intro", which: 1 } };
      if (check === "mock2") return { ...s, screen: { kind: "mock_intro", which: 2 } };
      return { ...s, screen: { kind: "home" } };
    }

    case "MOCK_START": {
      const rng = substream(s.seed, "mock", s.mocks.length);
      const items = sampleMock(bank, s.evidence, rng);
      return {
        ...s,
        activeMock: { items, results: [], index: 0, which: ev.which },
        screen: { kind: "mock", index: 0, total: items.length },
      };
    }

    case "MOCK_ANSWER": {
      if (!s.activeMock || s.screen.kind !== "mock") return s;
      const { items, results, index } = s.activeMock;
      const item = items[index];
      if (ev.variantId && ev.variantId !== item.variantId) return s; // stale-event guard
      const variant = variantById(bank, item.factId, item.variantId);
      const correct = isAnswerCorrect(variant, ev.optionIdx);
      let next = recordEvidence(s, bank, item.factId, correct ? "mock_correct" : "mock_wrong", ev.nowMs);
      const newResults = [...results, correct];
      if (index + 1 < items.length) {
        return {
          ...next,
          activeMock: { ...s.activeMock, results: newResults, index: index + 1 },
          screen: { kind: "mock", index: index + 1, total: items.length },
        };
      }
      // mock complete
      const { score, passed } = mockScore(newResults.map((c) => ({ correct: c })));
      const record: MockRecord = { at: ev.nowMs, items, results: newResults, score, passed };
      const missedFacts = items.filter((_, i) => !newResults[i]).map((i) => i.factId);
      let queue = scheduleAtFront(next.queue, missedFacts);
      next = {
        ...next,
        mocks: [...next.mocks, record],
        activeMock: null,
        queue,
        meter: missedFacts.length > 0 ? armDrop(next.meter, "mock") : next.meter,
      };
      next = recompute(next, bank);
      return { ...next, screen: { kind: "mock_results", mockIndex: next.mocks.length - 1 } };
    }

    case "MOCK_RESULTS_ACK": {
      const check = arcCheck(s);
      if (check === "stop") return { ...s, stopShownAt: ev.nowMs, screen: { kind: "ready" } };
      return { ...s, screen: { kind: "home" } };
    }

    case "GO_HOME":
      return { ...s, screen: { kind: "home" }, lastActiveAt: ev.nowMs };

    case "GO_OUTCOME":
      return { ...s, screen: { kind: "outcome" }, lastActiveAt: ev.nowMs };

    case "RESET_ALL":
      // start over from nothing — new seed, clean slate
      return initialState(ev.seed, ev.nowMs);

    case "KEEP_GOING":
      return { ...s, keepGoingChosen: true, screen: { kind: "keep_going" } };

    case "RECHECK_MARK": {
      if (!s.recheck || s.screen.kind !== "recheck") return s;
      const factId = s.recheck.order[s.recheck.index];
      let next = recordEvidence(s, bank, factId, ev.knew ? "speed_knew" : "speed_notsure", ev.nowMs);
      const i = next.recheck!.index + 1;
      if (i >= next.recheck!.order.length) {
        next = recompute(next, bank);
        return { ...next, recheck: null, screen: { kind: "home" } };
      }
      return {
        ...next,
        recheck: { ...next.recheck!, index: i },
        screen: { kind: "recheck", factId: next.recheck!.order[i], index: i, total: next.recheck!.order.length },
      };
    }

    case "OUTCOME_REPORT": {
      const outcome = { result: ev.result, at: ev.nowMs } as const;
      if (ev.result === "passed") return { ...s, outcome, screen: { kind: "done" } };
      if (ev.result === "failed") {
        // humility: reset the stop latch, nudge ability down, resume drilling
        return {
          ...s,
          outcome,
          stopShownAt: null,
          ability: { ...s.ability, mu: s.ability.mu - 0.05 },
          meter: armDrop(s.meter, "mock"),
          screen: { kind: "home" },
        };
      }
      return { ...s, outcome, screen: { kind: "home" } };
    }
  }
}
