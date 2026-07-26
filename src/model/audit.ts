/**
 * Honesty audits. Roughly 1 in AUDIT_RATE facts the user marked "Knew it" is
 * silently re-asked as a normal drill question. If audited accuracy comes in
 * below what an honest self-reporter would score, every self-report is
 * discounted proportionally via h — recomputed, never replayed. Silent.
 */
import { TUNING } from "./tuning";

export interface AuditLedger {
  /** factIds the user claimed to know in the speed round */
  claimed: string[];
  /** audits performed so far */
  audited: { factId: string; correct: boolean }[];
}

export function emptyAuditLedger(): AuditLedger {
  return { claimed: [], audited: [] };
}

/**
 * Honesty factor h in [0,1].
 * Laplace-smoothed audit accuracy normalized by the honest baseline (honest
 * people still miss ~10% of "known" items against real distractors).
 */
export function honestyFactor(ledger: AuditLedger): number {
  const m = ledger.audited.length;
  if (m < TUNING.AUDIT_MIN_SAMPLE) return 1;
  const k = ledger.audited.filter((a) => a.correct).length;
  const acc = (k + 1) / (m + 2);
  return Math.min(1, acc / TUNING.AUDIT_HONEST_BASELINE);
}

/** Facts still claimable for an audit (claimed, not yet audited). */
export function unauditedClaims(ledger: AuditLedger): string[] {
  const done = new Set(ledger.audited.map((a) => a.factId));
  return ledger.claimed.filter((f) => !done.has(f));
}
