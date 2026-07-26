import { describe, expect, it } from "vitest";
import bankJson from "../../src/content/bank.json";
import type { Bank } from "../../src/content/types";
import { mulberry32 } from "../../src/lib/rng";
import { emptyEvidence, applyEvent, type FactEvidence } from "../../src/model/evidence";
import { emptyAuditLedger } from "../../src/model/audit";
import { TUNING } from "../../src/model/tuning";
import {
  dueRepeat,
  emptyQueue,
  scheduleAfterLadderCorrect,
  scheduleAfterMiss,
  scheduleAtFront,
} from "../../src/scheduler/queue";
import { serveNext, type ServeContext } from "../../src/scheduler/blocks";
import { emptyCadence } from "../../src/scheduler/audits";
import { speedPool } from "../../src/scheduler/speedRound";
import { sampleMock, mockScore } from "../../src/scheduler/mocks";
import { expectedGain, expectedSeconds, factValue } from "../../src/scheduler/value";

const bank = bankJson as unknown as Bank;

function ctx(overrides: Partial<ServeContext> = {}): ServeContext {
  return {
    bank,
    evidence: {},
    ability: { mu: 0, nEv: 0 },
    honesty: 1,
    queue: emptyQueue(),
    cadence: emptyCadence(),
    ledger: emptyAuditLedger(),
    servedInBlock: [],
    missedInBlock: [],
    rng: mulberry32(1),
    ...overrides,
  };
}

describe("value function", () => {
  it("vanishes for known items, stays high for unknown/uncertain ones", () => {
    // nailed items are worth ~nothing
    expect(expectedGain(0.97)).toBeLessThan(expectedGain(0.5) / 5);
    // unknown items are worth the most raw gain (one card teaches the most)
    expect(expectedGain(0.1)).toBeGreaterThan(expectedGain(0.5));
    // per-second value is monotone decreasing toward mastery
    const perSec = (p: number) => expectedGain(p) / expectedSeconds(p);
    expect(perSec(0.3)).toBeGreaterThan(perSec(0.7));
    expect(perSec(0.7)).toBeGreaterThan(perSec(0.95));
    expect(expectedSeconds(1)).toBe(TUNING.EXPECTED_SECONDS_CORRECT);
    expect(expectedSeconds(0)).toBe(TUNING.EXPECTED_SECONDS_WRONG);
  });

  it("weights by exam appearance", () => {
    const f1 = { ...bank.facts[0], appearWeight: 0.2 };
    const f2 = { ...bank.facts[0], appearWeight: 0.02 };
    expect(factValue(f1, 0.5, 0)).toBeGreaterThan(factValue(f2, 0.5, 0));
  });
});

describe("repeat ladder", () => {
  it("miss schedules at +3; corrects climb +10/+25/+60 then graduate", () => {
    let q = emptyQueue();
    q = scheduleAfterMiss(q, "f1");
    expect(q.repeats).toEqual([{ position: 3, factId: "f1" }]);
    expect(q.ladder["f1"]).toBe(0);
    // not due before +3
    expect(dueRepeat(q)).toBeNull();
    q = { ...q, cursor: 3 };
    expect(dueRepeat(q)).toBe("f1");
    q = scheduleAfterLadderCorrect(q, "f1");
    expect(q.repeats).toEqual([{ position: 13, factId: "f1" }]);
    q = { ...q, cursor: 13 };
    q = scheduleAfterLadderCorrect(q, "f1");
    expect(q.repeats).toEqual([{ position: 38, factId: "f1" }]);
    q = { ...q, cursor: 38 };
    q = scheduleAfterLadderCorrect(q, "f1");
    expect(q.repeats).toEqual([{ position: 98, factId: "f1" }]);
    q = { ...q, cursor: 98 };
    q = scheduleAfterLadderCorrect(q, "f1");
    expect(q.repeats).toEqual([]);
    expect(q.ladder["f1"]).toBeUndefined();
  });

  it("a new miss resets the ladder", () => {
    let q = emptyQueue();
    q = scheduleAfterMiss(q, "f1");
    q = { ...q, cursor: 3 };
    q = scheduleAfterLadderCorrect(q, "f1"); // rung 1, due at 13
    q = scheduleAfterMiss(q, "f1"); // missed again
    expect(q.ladder["f1"]).toBe(0);
    expect(q.repeats).toEqual([{ position: 6, factId: "f1" }]);
  });

  it("mock misses go to the front", () => {
    let q = emptyQueue();
    q = { ...q, cursor: 50 };
    q = scheduleAtFront(q, ["a", "b"]);
    expect(dueRepeat(q)).toBe("a");
  });
});

describe("serveNext", () => {
  it("never serves a clean fact twice in a block", () => {
    const c = ctx();
    const served: string[] = [];
    for (let i = 0; i < 60; i++) {
      const d = serveNext({ ...c, servedInBlock: served });
      expect(d).not.toBeNull();
      served.push(d!.factId);
    }
    expect(new Set(served).size).toBe(served.length);
  });

  it("serves due repeats first", () => {
    const c = ctx();
    let q = scheduleAfterMiss(c.queue, bank.facts[5].id);
    q = { ...q, cursor: 3 };
    const d = serveNext({ ...c, queue: q });
    expect(d!.factId).toBe(bank.facts[5].id);
    expect(d!.isRepeat).toBe(true);
  });

  it("injects audits at the cadence from the claimed pool only", () => {
    const claimed = bank.facts.slice(0, 30).map((f) => f.id);
    const c = ctx({
      ledger: { claimed, audited: [] },
      cadence: { sinceLast: TUNING.AUDIT_RATE - 1 },
    });
    const d = serveNext(c);
    expect(d!.isAudit).toBe(true);
    expect(claimed).toContain(d!.factId);
  });

  it("skips leeches entirely", () => {
    const evidence: Record<string, FactEvidence> = {};
    let ev = emptyEvidence();
    for (let i = 0; i < TUNING.LEECH_MISSES; i++) ev = applyEvent(ev, "drill_wrong", 0);
    const leechId = bank.facts[0].id;
    evidence[leechId] = ev;
    const c = ctx({ evidence });
    // even scheduled repeats for leeches are skipped
    let q = scheduleAfterMiss(c.queue, leechId);
    q = { ...q, cursor: 10 };
    const served: string[] = [];
    for (let i = 0; i < 100; i++) {
      const d = serveNext({ ...c, queue: q, servedInBlock: served });
      served.push(d!.factId);
    }
    expect(served).not.toContain(leechId);
  });

  it("caps same-theme runs at the tuning limit", () => {
    const c = ctx();
    const byId = new Map(bank.facts.map((f) => [f.id, f.themeId]));
    const served: string[] = [];
    for (let i = 0; i < 80; i++) {
      const d = serveNext({ ...c, servedInBlock: served });
      served.push(d!.factId);
    }
    let run = 1;
    for (let i = 1; i < served.length; i++) {
      run = byId.get(served[i]) === byId.get(served[i - 1]) ? run + 1 : 1;
      expect(run).toBeLessThanOrEqual(TUNING.THEME_RUN_CAP + 1); // soft cap: blocked theme still allowed if nothing else
    }
  });
});

describe("speedPool", () => {
  it("only eligible facts, capped, covers areas, deterministic", () => {
    const pool = speedPool(bank, mulberry32(9));
    expect(pool.length).toBeLessThanOrEqual(TUNING.SPEED_POOL_MAX);
    expect(pool.length).toBeGreaterThan(80);
    const byId = new Map(bank.facts.map((f) => [f.id, f]));
    for (const id of pool) expect(byId.get(id)!.speedEligible).toBe(true);
    const pool2 = speedPool(bank, mulberry32(9));
    expect(pool2).toEqual(pool);
    // areas with any eligible fact are represented
    const eligibleAreas = new Set(bank.facts.filter((f) => f.speedEligible).map((f) => f.area));
    const poolAreas = new Set(pool.map((id) => byId.get(id)!.area));
    expect(poolAreas).toEqual(eligibleAreas);
  });
});

describe("mocks", () => {
  it("samples 24 unique facts, theme-plausible, and scores at 18", () => {
    const items = sampleMock(bank, {}, mulberry32(3));
    expect(items).toHaveLength(24);
    expect(new Set(items.map((i) => i.factId)).size).toBe(24);
    const { score, passed } = mockScore(new Array(24).fill(0).map((_, i) => ({ correct: i < 18 })));
    expect(score).toBe(18);
    expect(passed).toBe(true);
    expect(mockScore(new Array(24).fill(0).map((_, i) => ({ correct: i < 17 }))).passed).toBe(false);
  });

  it("theme distribution roughly follows shares over many mocks", () => {
    const rng = mulberry32(4);
    const byId = new Map(bank.facts.map((f) => [f.id, f]));
    const counts = new Map<string, number>();
    const N = 300;
    for (let m = 0; m < N; m++) {
      for (const item of sampleMock(bank, {}, rng)) {
        const t = byId.get(item.factId)!.themeId;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    // biggest theme should appear noticeably more than a tiny one
    const themes = [...bank.themes].sort((a, b) => b.share - a.share);
    const big = counts.get(themes[0].id) ?? 0;
    const small = counts.get(themes[themes.length - 1].id) ?? 0;
    expect(big).toBeGreaterThan(small * 2);
  });
});
