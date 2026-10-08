import type { Exercise, ExerciseId } from "../exercises/types";
import type {
  WorkoutSession,
  WorkoutSessionId,
  WorkoutTemplate,
} from "../workouts/types";
import { average, buildMetrics, selectAnalysisSessions } from "./metrics";
import {
  DEFAULT_PROGRESSION_THRESHOLDS,
  type ProgressionThresholds,
} from "./thresholds";
import type {
  ConfidenceLevel,
  ProgressionMetrics,
  ReasonCode,
  RecommendationAction,
  SessionExerciseSummary,
} from "./types";

export interface AnalyzeExerciseInput {
  readonly sessions: readonly WorkoutSession[];
  readonly exerciseId: ExerciseId;
  readonly exercise?: Exercise;
  readonly templates?: readonly WorkoutTemplate[];
  readonly thresholds?: ProgressionThresholds;
}

export interface ExerciseAnalysis {
  readonly exerciseId: ExerciseId;
  readonly action: RecommendationAction;
  readonly currentTarget: number | null;
  readonly suggestedTarget: number | null;
  readonly confidence: ConfidenceLevel;
  readonly reasonCode: ReasonCode;
  readonly metrics: ProgressionMetrics;
  readonly supportingSessionIds: readonly WorkoutSessionId[];
}

interface Decision {
  readonly action: RecommendationAction;
  readonly reasonCode: ReasonCode;
  readonly suggestedTarget: number | null;
  readonly confidence: ConfidenceLevel;
}

/** Cible prévue par les templates (repli quand aucune séance n'existe). */
export function findTemplateTarget(
  templates: readonly WorkoutTemplate[],
  exerciseId: ExerciseId,
): number | null {
  const orderedTemplates = [...templates].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  for (const template of orderedTemplates) {
    const blocks = [...template.blocks].sort((a, b) => a.order - b.order);
    for (const block of blocks) {
      if (block.type === "emom") {
        const movement = block.config.rotation.find(
          (item) => item.exerciseId === exerciseId,
        );
        if (movement !== undefined) {
          return movement.targetReps;
        }
      } else if (block.exerciseId === exerciseId) {
        return block.config.targetReps;
      }
    }
  }
  return null;
}

const targetStep = (
  target: number,
  thresholds: ProgressionThresholds,
): number => Math.max(1, Math.round(target * thresholds.targetStepRatio));

function computeConfidence(
  count: number,
  metrics: ProgressionMetrics,
  thresholds: ProgressionThresholds,
): ConfidenceLevel {
  if (count < thresholds.mediumConfidenceSessions || !metrics.comparable) {
    return "low";
  }
  const base: ConfidenceLevel =
    count >= thresholds.highConfidenceSessions ? "high" : "medium";
  if (metrics.consistencyCv <= thresholds.consistencyCvThreshold) {
    return base;
  }
  return base === "high" ? "medium" : "low";
}

function decide(
  summaries: readonly SessionExerciseSummary[],
  metrics: ProgressionMetrics,
  currentTarget: number | null,
  thresholds: ProgressionThresholds,
): Decision {
  const count = summaries.length;
  const hold = (
    action: RecommendationAction,
    reasonCode: ReasonCode,
    confidence: ConfidenceLevel,
    suggestedTarget: number | null = currentTarget,
  ): Decision => ({ action, reasonCode, suggestedTarget, confidence });

  const last = summaries[count - 1];
  if (currentTarget === null || currentTarget <= 0 || last === undefined) {
    return hold("insufficient_data", "no_data", "low");
  }
  if (count === 1) {
    return hold("insufficient_data", "single_session", "low");
  }

  const step = targetStep(currentTarget, thresholds);
  const raised = currentTarget + step;

  /* Moins de séances que le minimum : prudence, jamais de baisse. */
  if (count < thresholds.minSessionsForIncrease) {
    const pair = summaries.slice(-2);
    const first = pair[0];
    const second = pair[1];
    if (first === undefined || second === undefined || !metrics.comparable) {
      return hold("insufficient_data", "two_sessions_cautious", "low");
    }
    const clearBar = 1 + thresholds.clearExcessRateTwoSessions;
    const clear =
      pair.every(
        (summary) => summary.averageReps >= summary.targetReps * clearBar,
      ) &&
      second.averageReps >= first.averageReps &&
      metrics.intraSessionDrop < thresholds.intraSessionDropThreshold;
    if (clear) {
      return hold("increase", "two_sessions_clear_progress", "low", raised);
    }
    if (
      pair.every(
        (summary) =>
          summary.averageReps >=
          summary.targetReps * thresholds.belowTargetRate,
      )
    ) {
      return hold("maintain", "two_sessions_cautious", "low");
    }
    return hold("insufficient_data", "two_sessions_cautious", "low");
  }

  const confidence = computeConfidence(count, metrics, thresholds);

  if (!metrics.comparable) {
    return hold("maintain", "not_comparable", "low");
  }

  /* Baisse : répétée sur plusieurs séances récentes, jamais sur une séance isolée. */
  const dropCount = thresholds.dropRecentSessionCount;
  const recentDrop = summaries.slice(-dropCount);
  const baseline = summaries.slice(
    -(dropCount + thresholds.baselineSessionCount),
    -dropCount,
  );
  const baselineAverage = average(
    baseline.map((summary) => summary.averageReps),
  );
  const repeatedDrop =
    count >= thresholds.minSessionsForDecrease &&
    baseline.length > 0 &&
    recentDrop.length === dropCount &&
    recentDrop.every(
      (summary) =>
        summary.averageReps <=
          baselineAverage * (1 - thresholds.performanceDropThreshold) &&
        summary.averageReps < summary.targetReps * thresholds.belowTargetRate,
    );
  if (repeatedDrop) {
    const lowered = Math.max(thresholds.minTargetReps, currentTarget - step);
    if (lowered < currentTarget) {
      return hold("decrease", "repeated_drop", confidence, lowered);
    }
    return hold("maintain", "on_target", confidence);
  }

  /* Hausse : régulièrement au-dessus de la cible, sans dégradation récente. */
  const recent = summaries.slice(-thresholds.recentSessionCount);
  const bar = 1 + thresholds.minExcessRepRate;
  const above = recent.filter(
    (summary) => summary.averageReps >= summary.targetReps * bar,
  ).length;
  const progressing =
    count >= thresholds.minSessionsForIncrease &&
    recent.length === thresholds.recentSessionCount &&
    above >= thresholds.minSessionsAboveTarget &&
    last.averageReps >= last.targetReps * bar;
  if (
    progressing &&
    metrics.intraSessionDrop >= thresholds.intraSessionDropThreshold
  ) {
    return hold("maintain", "fatigue_within_session", confidence);
  }
  if (progressing) {
    return hold("increase", "steady_progress", confidence, raised);
  }

  if (last.averageReps < last.targetReps * thresholds.belowTargetRate) {
    return hold("maintain", "isolated_dip", confidence);
  }
  return hold(
    "maintain",
    metrics.averageExcessRate > 0 ? "insufficient_progress" : "on_target",
    confidence,
  );
}

export function analyzeExerciseProgression(
  input: AnalyzeExerciseInput,
): ExerciseAnalysis {
  const thresholds = input.thresholds ?? DEFAULT_PROGRESSION_THRESHOLDS;
  const summaries = selectAnalysisSessions(
    input.sessions,
    input.exerciseId,
    thresholds.analysisWindowSessions,
  );
  const supportsBodyweight = input.exercise?.supportsBodyweight ?? true;
  const metrics = buildMetrics(summaries, supportsBodyweight, thresholds);

  const lastSummary = summaries[summaries.length - 1];
  const currentTarget =
    lastSummary?.targetReps ??
    (input.templates === undefined
      ? null
      : findTemplateTarget(input.templates, input.exerciseId));

  const decision = decide(summaries, metrics, currentTarget, thresholds);

  return {
    exerciseId: input.exerciseId,
    action: decision.action,
    currentTarget,
    suggestedTarget: decision.suggestedTarget,
    confidence: decision.confidence,
    reasonCode: decision.reasonCode,
    metrics,
    supportingSessionIds: summaries.map((summary) => summary.sessionId),
  };
}
