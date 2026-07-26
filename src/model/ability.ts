/**
 * Global ability offset delta ~ N(mu, sigma^2) — the pooling term that lets
 * "this user is generally strong/weak" flow across facts. Without it,
 * independent per-fact posteriors plateau and the meter can never unlock on
 * schedule (verified by simulation during design).
 */
import { TUNING, type StudiedBefore } from "./tuning";

export interface Ability {
  mu: number;
  /** total evidence weight observed (drives sigma shrinkage) */
  nEv: number;
}

export function initialAbility(studied: StudiedBefore): Ability {
  return { mu: TUNING.ABILITY_MU0[studied] ?? 0, nEv: 0 };
}

export function abilitySigma(a: Ability): number {
  const { ABILITY_SIGMA0, ABILITY_N0 } = TUNING;
  return ABILITY_SIGMA0 * Math.sqrt(ABILITY_N0 / (ABILITY_N0 + a.nEv));
}

/**
 * Online update: nudge mu toward the prediction residual (x - p_pred), with
 * learning weight w (the event's evidence weight).
 */
export function updateAbility(a: Ability, x: 0 | 1, pPred: number, w: number): Ability {
  const n0 = TUNING.ABILITY_N0;
  const mu = (a.mu * (n0 + a.nEv) + w * (x - pPred)) / (n0 + a.nEv + w);
  return { mu, nEv: a.nEv + w };
}

/** Effective per-fact correctness probability with the ability offset. */
export function effectiveP(factMean: number, a: Ability): number {
  return Math.min(TUNING.P_CLAMP_HI, Math.max(TUNING.P_CLAMP_LO, factMean + a.mu));
}
