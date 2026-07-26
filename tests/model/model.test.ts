import { describe, expect, it } from "vitest";
import { applyEvent, emptyEvidence, posterior, eventWeight } from "../../src/model/evidence";
import { emptyAuditLedger, honestyFactor } from "../../src/model/audit";
import { abilitySigma, effectiveP, initialAbility, updateAbility } from "../../src/model/ability";
import { decayAbility, decayEvidence, decayShrink } from "../../src/model/decay";
import { advanceMeter, armDrop, calibrationProgress, emptyMeter } from "../../src/model/meter";
import { TUNING } from "../../src/model/tuning";
import type { Predictive } from "../../src/model/passSim";

describe("evidence & posterior", () => {
  it("prior-only posterior equals the prior", () => {
    const p = posterior(0.8, undefined, 1);
    expect(p.mean).toBeCloseTo(0.8, 10);
    expect(p.alpha + p.beta).toBeCloseTo(TUNING.PRIOR_STRENGTH_C, 10);
  });

  it("applies the evidence table exactly", () => {
    let ev = emptyEvidence();
    ev = applyEvent(ev, "speed_knew", 0);
    ev = applyEvent(ev, "drill_correct", 0);
    ev = applyEvent(ev, "drill_correct_tf", 0);
    ev = applyEvent(ev, "drill_wrong", 0);
    ev = applyEvent(ev, "drill_notsure", 0);
    ev = applyEvent(ev, "mock_correct", 0);
    ev = applyEvent(ev, "mock_wrong", 0);
    expect(ev.srK).toBe(1);
    expect(ev.drC).toBeCloseTo(1 + 0.67);
    expect(ev.drW).toBeCloseTo(1 + 0.75);
    expect(ev.moC).toBeCloseTo(1.5);
    expect(ev.moW).toBeCloseTo(3.0);
    expect(ev.misses).toBe(3); // wrong + notsure + mock_wrong
    const p = posterior(0.5, ev, 1);
    const C = TUNING.PRIOR_STRENGTH_C;
    expect(p.alpha).toBeCloseTo(C * 0.5 + 1 / 3 + 1.67 + 1.5);
    expect(p.beta).toBeCloseTo(C * 0.5 + 1.75 + 3.0);
  });

  it("honesty h discounts self-reports only, without replay", () => {
    let ev = emptyEvidence();
    ev = applyEvent(ev, "speed_knew", 0);
    ev = applyEvent(ev, "speed_knew", 0);
    ev = applyEvent(ev, "speed_knew", 0);
    const trusted = posterior(0.8, ev, 1);
    const distrusted = posterior(0.8, ev, 0.5);
    expect(distrusted.mean).toBeLessThan(trusted.mean);
    // drill evidence untouched by h
    const evD = applyEvent(emptyEvidence(), "drill_correct", 0);
    expect(posterior(0.8, evD, 0.5).mean).toEqual(posterior(0.8, evD, 1).mean);
  });

  it("leech latches at exactly the 5th miss", () => {
    let ev = emptyEvidence();
    for (let i = 0; i < 4; i++) ev = applyEvent(ev, "drill_wrong", 0);
    expect(ev.leech).toBe(false);
    ev = applyEvent(ev, "drill_wrong", 0);
    expect(ev.leech).toBe(true);
  });
});

describe("audit honesty factor", () => {
  it("trusts below the minimum sample", () => {
    const l = emptyAuditLedger();
    l.audited = [
      { factId: "a", correct: false },
      { factId: "b", correct: false },
    ];
    expect(honestyFactor(l)).toBe(1);
  });

  it("matches the worked example: 5 of 8 correct -> 0.667", () => {
    const l = emptyAuditLedger();
    l.audited = Array.from({ length: 8 }, (_, i) => ({ factId: `f${i}`, correct: i < 5 }));
    expect(honestyFactor(l)).toBeCloseTo((6 / 10) / 0.9, 3);
  });

  it("caps at 1 for honest users and is monotone in accuracy", () => {
    const mk = (k: number, m: number) => {
      const l = emptyAuditLedger();
      l.audited = Array.from({ length: m }, (_, i) => ({ factId: `f${i}`, correct: i < k }));
      return honestyFactor(l);
    };
    expect(mk(8, 8)).toBe(1);
    expect(mk(3, 8)).toBeLessThan(mk(5, 8));
    expect(mk(5, 8)).toBeLessThan(mk(7, 8));
  });
});

describe("ability", () => {
  it("sigma shrinks with evidence", () => {
    const a0 = initialAbility("no");
    const a1 = { ...a0, nEv: 100 };
    expect(abilitySigma(a1)).toBeLessThan(abilitySigma(a0));
  });

  it("mu moves toward surprising outcomes and clamps effectiveP", () => {
    let a = initialAbility("some");
    // consistent overperformance vs prediction 0.5
    for (let i = 0; i < 40; i++) a = updateAbility(a, 1, 0.5, 1);
    expect(a.mu).toBeGreaterThan(0.05);
    expect(effectiveP(0.98, a)).toBeLessThanOrEqual(TUNING.P_CLAMP_HI);
    expect(effectiveP(0.01, a)).toBeGreaterThanOrEqual(TUNING.P_CLAMP_LO);
  });
});

describe("decay", () => {
  it("dead zone under 3 days, floor at 0.35", () => {
    expect(decayShrink(0)).toBe(1);
    expect(decayShrink(2.9)).toBe(1);
    expect(decayShrink(3)).toBeCloseTo(1, 5);
    expect(decayShrink(17)).toBeCloseTo(Math.exp(-1), 5);
    expect(decayShrink(400)).toBe(TUNING.DECAY_FLOOR);
  });

  it("shrinks accumulators but preserves misses/leech", () => {
    let ev = emptyEvidence();
    for (let i = 0; i < 5; i++) ev = applyEvent(ev, "drill_wrong", 0);
    ev = applyEvent(ev, "drill_correct", 0);
    const d = decayEvidence(ev, 0.5);
    expect(d.drC).toBeCloseTo(ev.drC * 0.5);
    expect(d.drW).toBeCloseTo(ev.drW * 0.5);
    expect(d.misses).toBe(ev.misses);
    expect(d.leech).toBe(true);
    const a = decayAbility({ mu: 0.03, nEv: 100 }, 0.5);
    expect(a.mu).toBe(0.03);
    expect(a.nEv).toBe(50);
  });
});

function fakePred(q25: number, q35: number, width: number): Predictive {
  return { mean: q35, q05: q35 - width / 2, q25, q35, q50: q35, q95: q35 + width / 2, width };
}

describe("meter", () => {
  it("calibration progress maps width to 0..1", () => {
    expect(calibrationProgress(TUNING.METER_WIDTH_COLD)).toBe(0);
    expect(calibrationProgress(TUNING.METER_WIDTH_UNLOCK)).toBe(1);
    expect(calibrationProgress(0.9)).toBe(0);
  });

  it("unlocks and latches when width crosses the threshold", () => {
    let m = emptyMeter();
    let r = advanceMeter(m, fakePred(0.7, 0.72, 0.3), 40);
    expect(r.view.kind).toBe("calibrating");
    r = advanceMeter(r.meter, fakePred(0.7, 0.72, 0.14), 120);
    expect(r.view.kind).toBe("number");
    // width widening later does NOT re-lock
    r = advanceMeter(r.meter, fakePred(0.7, 0.72, 0.4), 130);
    expect(r.view.kind).toBe("number");
  });

  it("caps at 99 and floors unexplained drops", () => {
    let m = emptyMeter();
    let r = advanceMeter(m, fakePred(0.995, 0.999, 0.1), 100);
    expect(r.view.pct).toBe(99);
    // unexplained wobble down: display holds
    r = advanceMeter(r.meter, fakePred(0.93, 0.95, 0.1), 110);
    expect(r.view.pct).toBe(99);
    // armed drop: display falls with a reason
    const armed = armDrop(r.meter, "mock");
    r = advanceMeter(armed, fakePred(0.83, 0.85, 0.1), 120);
    expect(r.view.pct).toBeLessThan(99);
    expect(r.view.dropReason).toBe("mock");
  });

  it("ramp never lowers the number on its own (q25 <= q35 case)", () => {
    let m = emptyMeter();
    let r = advanceMeter(m, fakePred(0.8, 0.84, 0.12), 100);
    const first = r.view.pct!;
    // same distribution later in the ramp -> displayed quantile can only move q25 -> q35 (upward)
    r = advanceMeter(r.meter, fakePred(0.8, 0.84, 0.12), 100 + TUNING.METER_RAMP_EVIDENCE);
    expect(r.view.pct!).toBeGreaterThanOrEqual(first);
  });
});

describe("eventWeight", () => {
  it("matches the tuning table", () => {
    expect(eventWeight("speed_knew", 1)).toBeCloseTo(1 / 3);
    expect(eventWeight("speed_knew", 0.5)).toBeCloseTo(1 / 6);
    expect(eventWeight("mock_wrong", 1)).toBe(3);
  });
});
