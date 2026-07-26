/**
 * Deterministic RNG. Every random decision in the app flows through a named
 * substream derived from the user's base seed, so sessions are reproducible
 * in tests and simulations.
 */

export type Rng = () => number;

/** mulberry32 — small, fast, good-enough 32-bit PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → 32-bit int, for deriving substream seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Derive an independent substream: substream(seed, "mc", 42) */
export function substream(baseSeed: number, name: string, counter = 0): Rng {
  return mulberry32((baseSeed ^ hashString(name) ^ Math.imul(counter, 0x9e3779b9)) >>> 0);
}

/** Fisher–Yates shuffle, returns a new array. */
export function shuffled<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pick k distinct indices weighted by w (roulette without replacement). */
export function weightedSampleWithoutReplacement(
  weights: readonly number[],
  k: number,
  rng: Rng,
): number[] {
  const n = weights.length;
  const picked: number[] = [];
  const taken = new Array<boolean>(n).fill(false);
  let total = weights.reduce((a, b) => a + b, 0);
  const kk = Math.min(k, n);
  for (let c = 0; c < kk; c++) {
    let r = rng() * total;
    let idx = -1;
    for (let i = 0; i < n; i++) {
      if (taken[i]) continue;
      r -= weights[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      // numeric drift fallback: take last untaken
      for (let i = n - 1; i >= 0; i--) if (!taken[i]) { idx = i; break; }
    }
    taken[idx] = true;
    total -= weights[idx];
    picked.push(idx);
  }
  return picked;
}

/** Standard normal via Box–Muller. */
export function normalSample(rng: Rng, mean = 0, sd = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Gamma(shape, 1) via Marsaglia–Tsang; used for Beta sampling.
 * Valid for shape > 0.
 */
function gammaSample(shape: number, rng: Rng): number {
  if (shape < 1) {
    const u = rng();
    return gammaSample(1 + shape, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normalSample(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(alpha, beta) sample. */
export function betaSample(alpha: number, beta: number, rng: Rng): number {
  const x = gammaSample(alpha, rng);
  const y = gammaSample(beta, rng);
  return x / (x + y);
}
