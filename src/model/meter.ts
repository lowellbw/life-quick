/**
 * The readiness meter's two lives.
 *
 * Life one — calibration: a bar that fills as the predictive interval
 * narrows. It measures OUR uncertainty about the user, not their knowledge,
 * which is why it fills whether answers are right or wrong.
 *
 * Life two — prediction: once width <= unlock threshold (latched), a live
 * percentage. Conservative quantile (25th ramping to 35th), whole percent,
 * capped at 99, and never shown dropping without an attached reason.
 */
import { TUNING } from "./tuning";
import type { Predictive } from "./passSim";

export type DropReason = "mock" | "audit" | "recheck" | null;

export interface MeterState {
  unlocked: boolean;
  /** evidence units observed at unlock (for the quantile ramp) */
  evidenceAtUnlock: number;
  lastShownPct: number | null;
  pendingDrop: DropReason;
}

export function emptyMeter(): MeterState {
  return { unlocked: false, evidenceAtUnlock: 0, lastShownPct: null, pendingDrop: null };
}

/** Calibration-bar progress in [0,1] from the current interval width. */
export function calibrationProgress(width: number): number {
  const { METER_WIDTH_COLD, METER_WIDTH_UNLOCK } = TUNING;
  const p = (METER_WIDTH_COLD - width) / (METER_WIDTH_COLD - METER_WIDTH_UNLOCK);
  return Math.min(1, Math.max(0, p));
}

/** The quantile we display, ramping 25th -> 35th over post-unlock evidence. */
export function displayQuantile(pred: Predictive, evidenceNow: number, evidenceAtUnlock: number): number {
  const { METER_Q_START, METER_Q_END, METER_RAMP_EVIDENCE } = TUNING;
  const t = Math.min(1, Math.max(0, (evidenceNow - evidenceAtUnlock) / METER_RAMP_EVIDENCE));
  // linear blend between the two quantiles of the SAME distribution
  const q = pred.q25 + (pred.q35 - pred.q25) * ((METER_Q_START + (METER_Q_END - METER_Q_START) * t - 0.25) / 0.1);
  return q;
}

export interface MeterView {
  kind: "calibrating" | "number";
  /** calibrating: bar fill 0..1 */
  progress: number;
  /** number: whole percent 0..99 */
  pct: number | null;
  /** attach copy when a visible drop happens */
  dropReason: DropReason;
}

/**
 * Advance the meter with a fresh predictive. Pure: returns new state + view.
 * `evidenceNow` = total evidence weight observed (drives ramp + unlock latch).
 */
export function advanceMeter(
  meter: MeterState,
  pred: Predictive,
  evidenceNow: number,
): { meter: MeterState; view: MeterView } {
  let m = { ...meter };
  if (!m.unlocked && pred.width <= TUNING.METER_WIDTH_UNLOCK) {
    m.unlocked = true;
    m.evidenceAtUnlock = evidenceNow;
  }
  if (!m.unlocked) {
    return {
      meter: m,
      view: { kind: "calibrating", progress: calibrationProgress(pred.width), pct: null, dropReason: null },
    };
  }
  const raw = displayQuantile(pred, evidenceNow, m.evidenceAtUnlock);
  let pct = Math.min(TUNING.METER_CAP, Math.floor(raw * 100));
  let dropReason: DropReason = null;
  if (m.lastShownPct != null && pct < m.lastShownPct) {
    if (m.pendingDrop) {
      dropReason = m.pendingDrop; // explained drop — show it, with copy
    } else {
      pct = m.lastShownPct; // unexplained wobble — hold the line
    }
  }
  m = { ...m, lastShownPct: pct, pendingDrop: null };
  return { meter: m, view: { kind: "number", progress: 1, pct, dropReason } };
}

/** Mark that the next recompute is allowed to show a drop, with a reason. */
export function armDrop(meter: MeterState, reason: Exclude<DropReason, null>): MeterState {
  return { ...meter, pendingDrop: reason };
}
