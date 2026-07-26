import { describe, expect, it } from "vitest";
import { poissonBinomialPass, predictive, drawExams, type ModelInputs } from "../../src/model/passSim";
import { TUNING } from "../../src/model/tuning";
import bankJson from "../../src/content/bank.json";
import type { Bank } from "../../src/content/types";
import { mulberry32 } from "../../src/lib/rng";
import { applyEvent, emptyEvidence, type FactEvidence } from "../../src/model/evidence";

const bank = bankJson as unknown as Bank;

/** exact binomial P(X >= k) for validation */
function binomialAtLeast(n: number, p: number, k: number): number {
  let c = 1; // nC0
  let total = 0;
  for (let i = 0; i <= n; i++) {
    if (i >= k) total += c * Math.pow(p, i) * Math.pow(1 - p, n - i);
    c = (c * (n - i)) / (i + 1);
  }
  return total;
}

describe("poissonBinomialPass", () => {
  it("matches the exact binomial at the spec's anchor accuracies", () => {
    // Spec anchor table: 75%→~61%, 80%→~81%, 85%→~94%, 90%→~99%
    const anchors: Array<[number, number]> = [
      [0.75, 0.6074],
      [0.8, 0.8111],
      [0.85, 0.9428],
      [0.9, 0.9925],
    ];
    for (const [p, expected] of anchors) {
      const ps = new Array(24).fill(p);
      const got = poissonBinomialPass(ps, 18);
      expect(got).toBeCloseTo(binomialAtLeast(24, p, 18), 10);
      expect(Math.abs(got - expected)).toBeLessThan(0.001);
    }
  });

  it("handles heterogeneous probabilities sanely", () => {
    const ps = [...new Array(12).fill(0.95), ...new Array(12).fill(0.55)];
    const v = poissonBinomialPass(ps, 18);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
});

describe("drawExams", () => {
  it("draws M exams of 24 unique facts each", () => {
    const exams = drawExams(bank, mulberry32(42), 16);
    expect(exams).toHaveLength(16);
    for (const ex of exams) {
      expect(ex).toHaveLength(24);
      expect(new Set(ex).size).toBe(24);
    }
  });
});

function inputsWithUniformEvidence(correctRate: number, perFact: number): ModelInputs {
  const evidence: Record<string, FactEvidence> = {};
  const rng = mulberry32(7);
  for (const f of bank.facts) {
    let ev = emptyEvidence();
    for (let i = 0; i < perFact; i++) {
      ev = applyEvent(ev, rng() < correctRate ? "drill_correct" : "drill_wrong", 0);
    }
    evidence[f.id] = ev;
  }
  return { bank, evidence, ability: { mu: 0, nEv: perFact * bank.facts.length }, honesty: 1 };
}

describe("predictive", () => {
  it("is reproducible under a fixed seed", () => {
    const inputs: ModelInputs = { bank, evidence: {}, ability: { mu: 0, nEv: 0 }, honesty: 1 };
    const a = predictive(inputs, 123, 0);
    const b = predictive(inputs, 123, 0);
    expect(a).toEqual(b);
  });

  it("interval narrows as evidence accumulates", () => {
    const cold = predictive({ bank, evidence: {}, ability: { mu: 0, nEv: 0 }, honesty: 1 }, 99, 0);
    const warm = predictive(inputsWithUniformEvidence(0.8, 2), 99, 1);
    const hot = predictive(inputsWithUniformEvidence(0.8, 6), 99, 2);
    expect(warm.width).toBeLessThan(cold.width + 0.02); // allow tiny MC noise
    expect(hot.width).toBeLessThan(warm.width);
    expect(hot.width).toBeLessThan(TUNING.METER_WIDTH_UNLOCK);
  });

  it("orders users by ability: strong > weak", () => {
    const strong = inputsWithUniformEvidence(0.92, 4);
    const weak = inputsWithUniformEvidence(0.6, 4);
    const ps = predictive(strong, 5, 0);
    const pw = predictive(weak, 5, 0);
    expect(ps.q35).toBeGreaterThan(pw.q35);
    expect(ps.mean).toBeGreaterThan(pw.mean);
  });

  it("quantiles are ordered: q05 <= q25 <= q35 <= q50 <= q95", () => {
    const p = predictive(inputsWithUniformEvidence(0.75, 3), 11, 0);
    expect(p.q05).toBeLessThanOrEqual(p.q25);
    expect(p.q25).toBeLessThanOrEqual(p.q35);
    expect(p.q35).toBeLessThanOrEqual(p.q50);
    expect(p.q50).toBeLessThanOrEqual(p.q95);
  });
});
