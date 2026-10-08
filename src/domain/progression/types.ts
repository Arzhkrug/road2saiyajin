import type { ExerciseId } from "../exercises/types";
import type { EpochMs, WorkoutSessionId } from "../workouts/types";

export const RECOMMENDATION_ACTIONS = [
  "increase",
  "maintain",
  "decrease",
  "insufficient_data",
] as const;
export type RecommendationAction = (typeof RECOMMENDATION_ACTIONS)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export type ReasonCode =
  | "no_data"
  | "single_session"
  | "two_sessions_cautious"
  | "two_sessions_clear_progress"
  | "not_comparable"
  | "steady_progress"
  | "on_target"
  | "insufficient_progress"
  | "isolated_dip"
  | "fatigue_within_session"
  | "repeated_drop";

/** Résumé d'un exercice au sein d'une séance terminée. */
export interface SessionExerciseSummary {
  readonly sessionId: WorkoutSessionId;
  readonly completedAt: EpochMs;
  readonly performanceCount: number;
  readonly totalReps: number;
  readonly averageReps: number;
  readonly bestReps: number;
  /** Cible de la dernière performance de l'exercice dans la séance. */
  readonly targetReps: number;
  /** (moyenne - cible) / cible, 0 si cible <= 0. */
  readonly excessRate: number;
  /** Chute entre la première et la seconde moitié des séries (0 si < 2 séries). */
  readonly intraSessionDrop: number;
  readonly bodyweightKg: number | null;
  readonly externalLoadKg: number;
}

export interface ProgressionMetrics {
  readonly sessionCount: number;
  readonly averageReps: number;
  readonly bestReps: number;
  readonly recentAverageReps: number | null;
  readonly baselineAverageReps: number | null;
  readonly trendRatio: number | null;
  readonly averageExcessRate: number;
  readonly intraSessionDrop: number;
  readonly consistencyCv: number;
  readonly bodyweightKg: number | null;
  readonly bodyweightShiftRatio: number;
  readonly externalLoadKg: number;
  readonly loadVaries: boolean;
  /** false si le poids du corps ou la charge rend la comparaison incertaine. */
  readonly comparable: boolean;
}

export interface Recommendation {
  readonly exerciseId: ExerciseId;
  readonly action: RecommendationAction;
  readonly currentTarget: number | null;
  readonly suggestedTarget: number | null;
  readonly confidence: ConfidenceLevel;
  readonly reasonCode: ReasonCode;
  readonly reason: string;
  readonly metrics: ProgressionMetrics;
  /** Séances utilisées, de la plus ancienne à la plus récente. */
  readonly supportingSessionIds: readonly WorkoutSessionId[];
  readonly generatedAt: EpochMs;
}
