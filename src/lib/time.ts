/**
 * Injectable clock. Everything that needs "now" takes a Clock so tests and
 * simulations can drive time deterministically.
 */
export interface Clock {
  now(): number; // epoch ms
}

export const realClock: Clock = { now: () => Date.now() };

export function fixedClock(startMs: number): Clock & { advance(ms: number): void } {
  let t = startMs;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(earlierMs: number, laterMs: number): number {
  return (laterMs - earlierMs) / DAY_MS;
}
