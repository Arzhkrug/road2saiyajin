/* Heuristiques configurables, pas des vérités scientifiques. */

export const ANALYSIS_WINDOW_SESSIONS = 5;
export const RECENT_SESSION_COUNT = 3;
export const DROP_RECENT_SESSION_COUNT = 2;
export const BASELINE_SESSION_COUNT = 3;
export const MIN_SESSIONS_FOR_INCREASE = 3;
export const MIN_SESSIONS_FOR_DECREASE = 3;
export const MIN_EXCESS_REP_RATE = 0.1;
export const MIN_SESSIONS_ABOVE_TARGET = 2;
export const CLEAR_EXCESS_REP_RATE_TWO_SESSIONS = 0.25;
export const PERFORMANCE_DROP_THRESHOLD = 0.15;
export const BELOW_TARGET_RATE = 0.9;
export const INTRA_SESSION_DROP_THRESHOLD = 0.25;
export const BODYWEIGHT_SHIFT_THRESHOLD = 0.05;
export const LOAD_CHANGE_THRESHOLD_KG = 0.5;
export const CONSISTENCY_CV_THRESHOLD = 0.2;
export const MEDIUM_CONFIDENCE_SESSIONS = 3;
export const HIGH_CONFIDENCE_SESSIONS = 4;
export const TARGET_STEP_RATIO = 0.1;
export const MIN_TARGET_REPS = 1;

export interface ProgressionThresholds {
  readonly analysisWindowSessions: number;
  readonly recentSessionCount: number;
  readonly dropRecentSessionCount: number;
  readonly baselineSessionCount: number;
  readonly minSessionsForIncrease: number;
  readonly minSessionsForDecrease: number;
  readonly minExcessRepRate: number;
  readonly minSessionsAboveTarget: number;
  readonly clearExcessRateTwoSessions: number;
  readonly performanceDropThreshold: number;
  readonly belowTargetRate: number;
  readonly intraSessionDropThreshold: number;
  readonly bodyweightShiftThreshold: number;
  readonly loadChangeThresholdKg: number;
  readonly consistencyCvThreshold: number;
  readonly mediumConfidenceSessions: number;
  readonly highConfidenceSessions: number;
  readonly targetStepRatio: number;
  readonly minTargetReps: number;
}

export const DEFAULT_PROGRESSION_THRESHOLDS: ProgressionThresholds = {
  analysisWindowSessions: ANALYSIS_WINDOW_SESSIONS,
  recentSessionCount: RECENT_SESSION_COUNT,
  dropRecentSessionCount: DROP_RECENT_SESSION_COUNT,
  baselineSessionCount: BASELINE_SESSION_COUNT,
  minSessionsForIncrease: MIN_SESSIONS_FOR_INCREASE,
  minSessionsForDecrease: MIN_SESSIONS_FOR_DECREASE,
  minExcessRepRate: MIN_EXCESS_REP_RATE,
  minSessionsAboveTarget: MIN_SESSIONS_ABOVE_TARGET,
  clearExcessRateTwoSessions: CLEAR_EXCESS_REP_RATE_TWO_SESSIONS,
  performanceDropThreshold: PERFORMANCE_DROP_THRESHOLD,
  belowTargetRate: BELOW_TARGET_RATE,
  intraSessionDropThreshold: INTRA_SESSION_DROP_THRESHOLD,
  bodyweightShiftThreshold: BODYWEIGHT_SHIFT_THRESHOLD,
  loadChangeThresholdKg: LOAD_CHANGE_THRESHOLD_KG,
  consistencyCvThreshold: CONSISTENCY_CV_THRESHOLD,
  mediumConfidenceSessions: MEDIUM_CONFIDENCE_SESSIONS,
  highConfidenceSessions: HIGH_CONFIDENCE_SESSIONS,
  targetStepRatio: TARGET_STEP_RATIO,
  minTargetReps: MIN_TARGET_REPS,
};
