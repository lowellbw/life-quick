/**
 * Forgetting on return. Under DECAY_DEAD_DAYS nothing happens. Beyond it we
 * shrink every evidence accumulator once by s(gap) — pulling posteriors part
 * of the way back toward their priors, floored well above zero because
 * re-learning is faster than learning.
 */
import { TUNING } from "./tuning";
import type { FactEvidence } from "./evidence";
import type { Ability } from "./ability";

export function decayShrink(gapDays: number): number {
  if (gapDays < TUNING.DECAY_DEAD_DAYS) return 1;
  return Math.max(TUNING.DECAY_FLOOR, Math.exp(-(gapDays - TUNING.DECAY_DEAD_DAYS) / TUNING.DECAY_TAU_DAYS));
}

export function decayEvidence(ev: FactEvidence, s: number): FactEvidence {
  if (s >= 1) return ev;
  return {
    ...ev,
    srK: ev.srK * s,
    srN: ev.srN * s,
    drC: ev.drC * s,
    drW: ev.drW * s,
    moC: ev.moC * s,
    moW: ev.moW * s,
    // misses/leech are lifetime pedagogical counters — not decayed
  };
}

export function decayAbility(a: Ability, s: number): Ability {
  if (s >= 1) return a;
  return { mu: a.mu, nEv: a.nEv * s };
}
