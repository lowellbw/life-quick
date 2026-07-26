/**
 * Serving order inside a ~7-minute drill block:
 *   due repeat  >  audit injection  >  highest value(i)
 * with a soft cap on consecutive same-theme items and a hard rule that clean
 * items never repeat within a block (missed items may — that's the pedagogy).
 */
import type { Bank, Fact } from "../content/types";
import { TUNING } from "../model/tuning";
import type { Rng } from "../lib/rng";
import { posterior, type FactEvidence } from "../model/evidence";
import { effectiveP, type Ability } from "../model/ability";
import type { AuditLedger } from "../model/audit";
import { factValue, isMastered } from "./value";
import { dueRepeat, type QueueState } from "./queue";
import { shouldAudit, type AuditCadence } from "./audits";
import { unauditedClaims } from "../model/audit";

export interface ServeDecision {
  factId: string;
  isAudit: boolean;
  isRepeat: boolean;
}

export interface ServeContext {
  bank: Bank;
  evidence: Record<string, FactEvidence>;
  ability: Ability;
  honesty: number;
  queue: QueueState;
  cadence: AuditCadence;
  ledger: AuditLedger;
  servedInBlock: string[]; // factIds served this block (in order)
  missedInBlock: string[];
  rng: Rng;
}

export function factP(ctx: ServeContext, fact: Fact): number {
  const post = posterior(fact.prior, ctx.evidence[fact.id], ctx.honesty);
  return effectiveP(post.mean, ctx.ability);
}

function lastThemes(ctx: ServeContext): string[] {
  const byId = new Map(ctx.bank.facts.map((f) => [f.id, f.themeId]));
  return ctx.servedInBlock.slice(-TUNING.THEME_RUN_CAP).map((id) => byId.get(id) ?? "");
}

export function serveNext(ctx: ServeContext): ServeDecision | null {
  // 1. due ladder repeat (may legitimately repeat within the block after a miss)
  const due = dueRepeat(ctx.queue);
  if (due) {
    const ev = ctx.evidence[due];
    if (!ev?.leech) return { factId: due, isAudit: false, isRepeat: true };
  }

  // 2. audit cadence
  if (shouldAudit(ctx.cadence, ctx.ledger)) {
    const pool = unauditedClaims(ctx.ledger).filter((f) => !ctx.servedInBlock.includes(f));
    if (pool.length > 0) {
      const pick = pool[Math.floor(ctx.rng() * pool.length)];
      return { factId: pick, isAudit: true, isRepeat: false };
    }
  }

  // 3. highest value among eligible facts
  const served = new Set(ctx.servedInBlock);
  const recentThemes = lastThemes(ctx);
  const themeBlocked =
    recentThemes.length === TUNING.THEME_RUN_CAP && recentThemes.every((t) => t === recentThemes[0])
      ? recentThemes[0]
      : null;

  let best: { fact: Fact; v: number } | null = null;
  let bestBlockedTheme: { fact: Fact; v: number } | null = null;
  for (const fact of ctx.bank.facts) {
    if (served.has(fact.id)) continue;
    const ev = ctx.evidence[fact.id];
    if (ev?.leech) continue;
    const p = factP(ctx, fact);
    const mastered = isMastered(p, ev?.drC ?? 0);
    let v = factValue(fact, p, ctx.rng() * 2 - 1);
    if (mastered) v *= 0.05; // deprioritized, not excluded
    const slot = fact.themeId === themeBlocked ? "blocked" : "open";
    if (slot === "open") {
      if (!best || v > best.v) best = { fact, v };
    } else if (!bestBlockedTheme || v > bestBlockedTheme.v) {
      bestBlockedTheme = { fact, v };
    }
  }
  const chosen = best ?? bestBlockedTheme;
  if (!chosen) return null; // bank exhausted for this block
  return { factId: chosen.fact.id, isAudit: false, isRepeat: false };
}

/** Rough seconds consumed by a serving, for the block budget. */
export function servingSeconds(wasCorrect: boolean): number {
  return wasCorrect ? TUNING.EXPECTED_SECONDS_CORRECT : TUNING.EXPECTED_SECONDS_WRONG;
}
