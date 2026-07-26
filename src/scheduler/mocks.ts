/**
 * Mock tests: 24 facts sampled exactly like the pass simulation samples exams
 * (theme share -> uniform fact within theme, leeches included — an honest
 * sample), least-recently-seen variant preferred, no per-item feedback.
 */
import type { Bank, Fact, Variant } from "../content/types";
import { TUNING } from "../model/tuning";
import type { Rng } from "../lib/rng";
import type { FactEvidence } from "../model/evidence";
import { drawExams } from "../model/passSim";

export interface MockItem {
  factId: string;
  variantId: string;
}

export function sampleMock(bank: Bank, evidence: Record<string, FactEvidence>, rng: Rng): MockItem[] {
  const [exam] = drawExams(bank, rng, 1);
  return exam.map((fi) => {
    const fact: Fact = bank.facts[fi];
    const v = pickVariant(fact, evidence[fact.id]);
    return { factId: fact.id, variantId: v.id };
  });
}

export function pickVariant(fact: Fact, ev: FactEvidence | undefined): Variant {
  const cursor = ev?.variantCursor ?? 0;
  return fact.variants[cursor % fact.variants.length];
}

export function mockScore(results: { correct: boolean }[]): { score: number; passed: boolean } {
  const score = results.filter((r) => r.correct).length;
  return { score, passed: score >= TUNING.PASS_MARK };
}
