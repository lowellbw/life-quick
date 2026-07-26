/**
 * P(pass) predictive distribution — the number behind the meter.
 *
 * Two-level Monte Carlo, and the two levels matter:
 *
 *  - OUTER (epistemic, K draws): sample what the user's knowledge might truly
 *    be — a Beta draw per fact plus a Normal draw of the global ability
 *    offset. This is the uncertainty that shrinks as we observe answers, and
 *    it is what the calibration bar measures.
 *  - INNER (aleatory, M fixed exams): for each knowledge draw, average the
 *    exact Poisson-binomial P(>=18 of 24) over M exam compositions drawn ONCE
 *    (common random numbers). Exam-composition luck therefore stays inside
 *    each P_k instead of inflating the spread across draws — without CRN the
 *    interval never narrows and the meter never unlocks.
 *
 * Output: quantiles of {P_k}. The display shows a conservative quantile; the
 * unlock rule watches q95-q05.
 */
import type { Bank, Fact } from "../content/types";
import { TUNING } from "./tuning";
import { betaSample, normalSample, substream, type Rng } from "../lib/rng";
import { posterior, type FactEvidence } from "./evidence";
import { abilitySigma, type Ability } from "./ability";

export interface Predictive {
  mean: number;
  q05: number;
  q25: number;
  q35: number;
  q50: number;
  q95: number;
  width: number; // q95 - q05
}

export interface ModelInputs {
  bank: Bank;
  evidence: Record<string, FactEvidence>;
  ability: Ability;
  honesty: number; // h from the audit ledger
}

/** Exact P(sum >= passMark) for independent Bernoulli(p_i), via DP. */
export function poissonBinomialPass(ps: readonly number[], passMark: number): number {
  const n = ps.length;
  const f = new Array<number>(n + 1).fill(0);
  f[0] = 1;
  for (let i = 0; i < n; i++) {
    const p = ps[i];
    for (let j = i; j >= 0; j--) {
      f[j + 1] += f[j] * p;
      f[j] *= 1 - p;
    }
  }
  let s = 0;
  for (let j = passMark; j <= n; j++) s += f[j];
  return s;
}

/**
 * Draw M exam compositions (fact index lists) once, theme-weighted:
 * pick a theme by share, then a fact uniformly within it, no repeats.
 */
export function drawExams(bank: Bank, rng: Rng, m: number): number[][] {
  const themeFacts = new Map<string, number[]>();
  bank.facts.forEach((f, i) => {
    const list = themeFacts.get(f.themeId) ?? [];
    list.push(i);
    themeFacts.set(f.themeId, list);
  });
  const themes = bank.themes.filter((t) => (themeFacts.get(t.id)?.length ?? 0) > 0);
  const shares = themes.map((t) => t.share);
  const exams: number[][] = [];
  for (let e = 0; e < m; e++) {
    const chosen = new Set<number>();
    let guard = 0;
    while (chosen.size < TUNING.EXAM_QUESTIONS && guard++ < 4000) {
      // roulette over themes
      let r = rng() * shares.reduce((a, b) => a + b, 0);
      let ti = 0;
      for (; ti < themes.length; ti++) {
        r -= shares[ti];
        if (r <= 0) break;
      }
      const pool = themeFacts.get(themes[Math.min(ti, themes.length - 1)].id)!;
      const pick = pool[Math.floor(rng() * pool.length)];
      chosen.add(pick);
    }
    exams.push([...chosen]);
  }
  return exams;
}

/**
 * The predictive distribution over P(pass).
 * `seed`/`recompute` make results reproducible; recompute increments per call
 * site so successive computations use fresh but deterministic randomness.
 */
export function predictive(inputs: ModelInputs, seed: number, recompute: number): Predictive {
  const { bank, evidence, ability, honesty } = inputs;
  const K = TUNING.MC_EPISTEMIC_DRAWS;
  const M = TUNING.MC_EXAMS;
  const rngExams = substream(seed, "mc-exams", recompute);
  const rngDraws = substream(seed, "mc-draws", recompute);

  const exams = drawExams(bank, rngExams, M);

  // Facts that actually appear in any exam — only these need posteriors.
  const used = new Set<number>();
  for (const ex of exams) for (const i of ex) used.add(i);
  const post = new Map<number, { alpha: number; beta: number }>();
  for (const i of used) {
    const f: Fact = bank.facts[i];
    const p = posterior(f.prior, evidence[f.id], honesty);
    post.set(i, { alpha: p.alpha, beta: p.beta });
  }

  const sigma = abilitySigma(ability);
  const lo = TUNING.P_CLAMP_LO;
  const hi = TUNING.P_CLAMP_HI;

  const passes = new Array<number>(K);
  const theta = new Map<number, number>();
  for (let k = 0; k < K; k++) {
    const delta = normalSample(rngDraws, ability.mu, sigma);
    theta.clear();
    for (const i of used) {
      const { alpha, beta } = post.get(i)!;
      const t = betaSample(alpha, beta, rngDraws) + delta;
      theta.set(i, t < lo ? lo : t > hi ? hi : t);
    }
    let acc = 0;
    for (const ex of exams) {
      const ps = ex.map((i) => theta.get(i)!);
      acc += poissonBinomialPass(ps, TUNING.PASS_MARK);
    }
    passes[k] = acc / M;
  }
  passes.sort((a, b) => a - b);
  const q = (x: number) => passes[Math.min(K - 1, Math.max(0, Math.floor(x * K)))];
  const mean = passes.reduce((a, b) => a + b, 0) / K;
  const q05 = q(0.05);
  const q95 = q(0.95);
  return { mean, q05, q25: q(0.25), q35: q(0.35), q50: q(0.5), q95, width: q95 - q05 };
}
