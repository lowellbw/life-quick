/**
 * Silent honesty-audit injection: roughly every AUDIT_RATE-th drill serving is
 * a re-ask of a fact the user claimed to know, disguised as a normal question.
 */
import { TUNING } from "../model/tuning";
import { unauditedClaims, type AuditLedger } from "../model/audit";
import type { Rng } from "../lib/rng";

export interface AuditCadence {
  sinceLast: number;
}

export function emptyCadence(): AuditCadence {
  return { sinceLast: 0 };
}

export function shouldAudit(cadence: AuditCadence, ledger: AuditLedger): boolean {
  return cadence.sinceLast >= TUNING.AUDIT_RATE - 1 && unauditedClaims(ledger).length > 0;
}

export function pickAuditFact(ledger: AuditLedger, rng: Rng): string {
  const pool = unauditedClaims(ledger);
  return pool[Math.floor(rng() * pool.length)];
}
