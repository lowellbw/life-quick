/**
 * Per-fact evidence accumulators and the Beta posterior over "answers this
 * fact correctly". Accumulators are raw counts scaled at read time by the
 * honesty factor h (self-reports) — so an audit discount recomputes every
 * posterior with no history replay.
 */
import { TUNING } from "./tuning";

export interface FactEvidence {
  /** speed-round self-reports: knew-it / not-sure raw counts */
  srK: number;
  srN: number;
  /** drill correct/wrong, already weight-scaled (TF adjustment, not-sure 0.75) */
  drC: number;
  drW: number;
  /** mock correct/wrong, already weight-scaled (1.5 / 3.0) */
  moC: number;
  moW: number;
  /** lifetime drill+mock misses, drives the leech rule */
  misses: number;
  leech: boolean;
  /** rotate variants across serves */
  variantCursor: number;
  lastSeenAt: number | null;
}

export function emptyEvidence(): FactEvidence {
  return { srK: 0, srN: 0, drC: 0, drW: 0, moC: 0, moW: 0, misses: 0, leech: false, variantCursor: 0, lastSeenAt: null };
}

export interface Posterior {
  alpha: number;
  beta: number;
  mean: number;
}

/** Posterior from prior + accumulators. h = honesty factor in [0,1]. */
export function posterior(prior: number, ev: FactEvidence | undefined, h: number): Posterior {
  const C = TUNING.PRIOR_STRENGTH_C;
  let alpha = C * prior;
  let beta = C * (1 - prior);
  if (ev) {
    alpha += h * ev.srK * TUNING.SELF_REPORT_WEIGHT + ev.drC + ev.moC;
    beta += ev.srN * TUNING.SELF_REPORT_WEIGHT + ev.drW + ev.moW;
  }
  return { alpha, beta, mean: alpha / (alpha + beta) };
}

export type AnswerKind =
  | "speed_knew"
  | "speed_notsure"
  | "drill_correct"
  | "drill_correct_tf"
  | "drill_wrong"
  | "drill_notsure"
  | "mock_correct"
  | "mock_wrong";

/** The evidence weight w each event contributes (used for ability + meter N). */
export function eventWeight(kind: AnswerKind, h: number): number {
  switch (kind) {
    case "speed_knew":
      return h * TUNING.SELF_REPORT_WEIGHT;
    case "speed_notsure":
      return TUNING.SELF_REPORT_WEIGHT;
    case "drill_correct":
      return TUNING.DRILL_CORRECT_W;
    case "drill_correct_tf":
      return TUNING.TF_CORRECT_W;
    case "drill_wrong":
      return TUNING.DRILL_WRONG_W;
    case "drill_notsure":
      return TUNING.NOT_SURE_WRONG_W;
    case "mock_correct":
      return TUNING.MOCK_CORRECT_W;
    case "mock_wrong":
      return TUNING.MOCK_WRONG_W;
  }
}

/** Apply one event to a fact's accumulators (mutates a copy, returns it). */
export function applyEvent(ev: FactEvidence, kind: AnswerKind, nowMs: number): FactEvidence {
  const e = { ...ev, lastSeenAt: nowMs };
  switch (kind) {
    case "speed_knew":
      e.srK += 1;
      break;
    case "speed_notsure":
      e.srN += 1;
      break;
    case "drill_correct":
      e.drC += TUNING.DRILL_CORRECT_W;
      break;
    case "drill_correct_tf":
      e.drC += TUNING.TF_CORRECT_W;
      break;
    case "drill_wrong":
      e.drW += TUNING.DRILL_WRONG_W;
      e.misses += 1;
      break;
    case "drill_notsure":
      e.drW += TUNING.NOT_SURE_WRONG_W;
      e.misses += 1;
      break;
    case "mock_correct":
      e.moC += TUNING.MOCK_CORRECT_W;
      break;
    case "mock_wrong":
      e.moW += TUNING.MOCK_WRONG_W;
      e.misses += 1;
      break;
  }
  if (e.misses >= TUNING.LEECH_MISSES) e.leech = true;
  return e;
}

/** "x" value of an event for the ability update: 1 for correct-ish, 0 for wrong-ish. */
export function eventOutcome(kind: AnswerKind): 0 | 1 {
  switch (kind) {
    case "speed_knew":
    case "drill_correct":
    case "drill_correct_tf":
    case "mock_correct":
      return 1;
    default:
      return 0;
  }
}
