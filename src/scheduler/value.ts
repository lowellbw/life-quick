/**
 * What to ask next: maximize expected pass-probability gain per second.
 *
 *   value(i) = E[Δp_i] × appearWeight_i / expectedSeconds_i
 *
 * Consequences (deliberate): 50/50 items are worth the most; nailed and
 * near-zero-weight items fall away; we optimise for passing, not knowing.
 */
import type { Fact } from "../content/types";
import { TUNING } from "../model/tuning";

export function expectedSeconds(p: number): number {
  return p * TUNING.EXPECTED_SECONDS_CORRECT + (1 - p) * TUNING.EXPECTED_SECONDS_WRONG;
}

export function expectedGain(p: number): number {
  // correct consolidates a little; wrong triggers a card and learns a lot
  return p * TUNING.GAIN_CONSOLIDATE * (1 - p) + (1 - p) * TUNING.GAIN_CARD * (1 - p);
}

export function factValue(fact: Fact, p: number, jitter: number): number {
  const v = (expectedGain(p) * fact.appearWeight) / expectedSeconds(p);
  return v * (1 + 0.02 * jitter); // tiny seeded jitter for tie-breaks
}

export function isMastered(p: number, correctCount: number): boolean {
  return p >= TUNING.MASTERED_P && correctCount >= TUNING.MASTERED_MIN_CORRECT;
}
