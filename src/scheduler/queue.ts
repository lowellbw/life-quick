/**
 * The drilling queue: a position-indexed stream of servings.
 *
 * Two sources feed it: due repeats (misses climb the +3/+10/+25/+60 ladder,
 * pre-inserted at absolute positions) and on-demand value picks. Audits are
 * injected by blocks.ts between the two.
 */
import { TUNING } from "../model/tuning";

export interface QueueState {
  /** absolute serving position, increments once per served item */
  cursor: number;
  /** scheduled repeats: position -> factIds due at/after that position */
  repeats: { position: number; factId: string }[];
  /** repeat-ladder rung per fact (0..3); absent = not on the ladder */
  ladder: Record<string, number>;
}

export function emptyQueue(): QueueState {
  return { cursor: 0, repeats: [], ladder: {} };
}

/** The earliest scheduled repeat due at or before the current cursor. */
export function dueRepeat(q: QueueState): string | null {
  let best: { position: number; factId: string } | null = null;
  for (const r of q.repeats) {
    if (r.position <= q.cursor && (best == null || r.position < best.position)) best = r;
  }
  return best?.factId ?? null;
}

export function removeRepeat(q: QueueState, factId: string): QueueState {
  const idx = q.repeats.findIndex((r) => r.factId === factId);
  if (idx === -1) return q;
  const repeats = q.repeats.slice(0, idx).concat(q.repeats.slice(idx + 1));
  return { ...q, repeats };
}

export function removeAllRepeats(q: QueueState, factId: string): QueueState {
  return { ...q, repeats: q.repeats.filter((r) => r.factId !== factId) };
}

/** After a miss: rung resets to 0 and the fact returns soon (+first offset). */
export function scheduleAfterMiss(q: QueueState, factId: string): QueueState {
  const cleaned = removeAllRepeats(q, factId);
  return {
    ...cleaned,
    ladder: { ...cleaned.ladder, [factId]: 0 },
    repeats: [...cleaned.repeats, { position: q.cursor + TUNING.LADDER_OFFSETS[0], factId }],
  };
}

/** After answering a ladder item correctly: climb, or graduate off the ladder. */
export function scheduleAfterLadderCorrect(q: QueueState, factId: string): QueueState {
  const rung = q.ladder[factId];
  const cleaned = removeAllRepeats(q, factId);
  if (rung == null) return cleaned;
  const next = rung + 1;
  if (next >= TUNING.LADDER_OFFSETS.length) {
    const { [factId]: _gone, ...rest } = cleaned.ladder;
    return { ...cleaned, ladder: rest };
  }
  return {
    ...cleaned,
    ladder: { ...cleaned.ladder, [factId]: next },
    repeats: [...cleaned.repeats, { position: q.cursor + TUNING.LADDER_OFFSETS[next], factId }],
  };
}

/** Put mock misses at the very front (served before anything else). */
export function scheduleAtFront(q: QueueState, factIds: string[]): QueueState {
  const cleanedRepeats = q.repeats.filter((r) => !factIds.includes(r.factId));
  const fronted = factIds.map((factId, i) => ({ position: q.cursor - factIds.length + i, factId }));
  const ladder = { ...q.ladder };
  for (const f of factIds) ladder[f] = 0;
  return { ...q, repeats: [...fronted, ...cleanedRepeats], ladder };
}

export function advanceCursor(q: QueueState): QueueState {
  return { ...q, cursor: q.cursor + 1 };
}
