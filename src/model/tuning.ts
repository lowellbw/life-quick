/**
 * Every model/scheduler constant lives here, in one file, so tuning is a
 * one-file diff and DESIGN.md can point at a single source of truth.
 */
export const TUNING = {
  // ---- priors ----
  /** Beta prior pseudo-count strength: alpha0 = C*p0, beta0 = C*(1-p0) */
  PRIOR_STRENGTH_C: 16,

  // ---- evidence weights ----
  /** self-reports count at a third of a real answer, scaled by honesty h */
  SELF_REPORT_WEIGHT: 1 / 3,
  /** drill answers */
  DRILL_CORRECT_W: 1.0,
  DRILL_WRONG_W: 1.0,
  /** correct on a 2-option question carries less signal (50% guess floor) */
  TF_CORRECT_W: 0.67,
  /** tapping "Not sure" counts as a soft miss */
  NOT_SURE_WRONG_W: 0.75,
  /** mocks are closest to ground truth; wrong weighted heavier than right — quick to lower, slow to raise */
  MOCK_CORRECT_W: 1.5,
  MOCK_WRONG_W: 3.0,

  // ---- honesty audits ----
  /** audit roughly 1 in N of self-reported "knew it" claims */
  AUDIT_RATE: 8,
  /** below this many audits, trust claims at face value */
  AUDIT_MIN_SAMPLE: 3,
  /** honest people still miss ~10% vs distractors; normalize by this */
  AUDIT_HONEST_BASELINE: 0.9,
  /** discounted self-report-only facts re-enter the queue below this mean */
  AUDIT_REQUEUE_BELOW: 0.85,

  // ---- global ability delta ----
  ABILITY_SIGMA0: 0.05,
  ABILITY_N0: 6,
  /** setup "studied before?" -> starting mu */
  ABILITY_MU0: { no: -0.02, some: 0.01, lots: 0.04 } as Record<string, number>,

  // ---- decay on return ----
  DECAY_DEAD_DAYS: 3,
  DECAY_TAU_DAYS: 14,
  DECAY_FLOOR: 0.35,
  RECHECK_ITEMS: 20,

  // ---- pass simulation ----
  EXAM_QUESTIONS: 24,
  PASS_MARK: 18,
  MC_EPISTEMIC_DRAWS: 1500,
  MC_EXAMS: 16, // common-random-number exam set
  P_CLAMP_LO: 0.05,
  P_CLAMP_HI: 0.99,

  // ---- meter ----
  /** calibration bar: width from cold start -> unlock */
  METER_WIDTH_COLD: 0.5,
  METER_WIDTH_UNLOCK: 0.15,
  /** displayed quantile ramps conservative -> spec over first N evidence units post-unlock */
  METER_Q_START: 0.25,
  METER_Q_END: 0.35,
  METER_RAMP_EVIDENCE: 60,
  METER_CAP: 99,

  // ---- triggers ----
  MOCK1_MEAN_THRESHOLD: 0.8,
  /** mock 2 offered when displayed quantile is within this of target */
  MOCK2_WITHIN_PTS: 3,

  // ---- scheduler ----
  BLOCK_SECONDS: 420,
  EXPECTED_SECONDS_CORRECT: 6,
  EXPECTED_SECONDS_WRONG: 22,
  SPEED_SECONDS_PER_ITEM: 3.5,
  /** learning-gain guesses for the value formula */
  GAIN_CONSOLIDATE: 0.1,
  GAIN_CARD: 0.5,
  /** repeat ladder: queue-position offsets after each successful rung */
  LADDER_OFFSETS: [3, 10, 25, 60],
  LEECH_MISSES: 5,
  /** deprioritize (not exclude) facts at/above this posterior with 2+ correct */
  MASTERED_P: 0.97,
  MASTERED_MIN_CORRECT: 2,
  /** avoid >2 consecutive same-theme items */
  THEME_RUN_CAP: 2,
  /** speed round pool size cap */
  SPEED_POOL_MAX: 110,
} as const;

export type StudiedBefore = "no" | "some" | "lots";
export type RetakePain = "fine" | "annoying" | "disaster";

export const TARGET_BY_PAIN: Record<RetakePain, 90 | 95 | 98> = {
  fine: 90,
  annoying: 95,
  disaster: 98,
};
