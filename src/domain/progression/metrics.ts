import type { ExerciseId } from "../exercises/types";
import { getCompletedSessions } from "../workouts/history";
import type { PerformanceEntry, WorkoutSession } from "../workouts/types";
import type { ProgressionThresholds } from "./thresholds";
import type { ProgressionMetrics, SessionExerciseSummary } from "./types";

export const average = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;

const roundTo = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Number.isFinite(rounded) ? rounded : 0;
};

/** (moyenne de la 1re moitié - moyenne de la dernière moitié) / moyenne de la 1re moitié. */
export function calculateIntraSessionDrop(reps: readonly number[]): number {
  const half = Math.floor(reps.length / 2);
  if (half === 0) {
    return 0;
  }
  const first = average(reps.slice(0, half));
  const last = average(reps.slice(reps.length - half));
  if (!(first > 0)) {
    return 0;
  }
  return Math.max(-1, (first - last) / first);
}

export interface PerformanceTrend {
  readonly recentAverage: number;
  readonly baselineAverage: number;
  readonly ratio: number;
}

/** Compare les `recentCount` dernières moyennes aux `baselineCount` précédentes. */
export function calculatePerformanceTrend(
  averages: readonly number[],
  recentCount: number,
  baselineCount: number,
): PerformanceTrend | null {
  if (
    recentCount <= 0 ||
    baselineCount <= 0 ||
    averages.length < recentCount + 1
  ) {
    return null;
  }
  const recent = averages.slice(-recentCount);
  const baseline = averages.slice(-(recentCount + baselineCount), -recentCount);
  const recentAverage = average(recent);
  const baselineAverage = average(baseline);
  return {
    recentAverage,
    baselineAverage,
    ratio: baselineAverage > 0 ? recentAverage / baselineAverage - 1 : 0,
  };
}

/** Coefficient de variation (écart-type / moyenne) ; 0 si non défini. */
export function calculateConsistencyCv(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  if (!(mean > 0)) {
    return 0;
  }
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

const compareEntries = (a: PerformanceEntry, b: PerformanceEntry): number =>
  a.recordedAt - b.recordedAt || a.order - b.order || a.id.localeCompare(b.id);

export function summarizeSessionExercise(
  session: WorkoutSession,
  exerciseId: ExerciseId,
): SessionExerciseSummary | null {
  const entries = session.performances
    .filter(
      (entry) =>
        entry.exerciseId === exerciseId &&
        Number.isFinite(entry.actualReps) &&
        entry.actualReps >= 0 &&
        Number.isFinite(entry.targetReps) &&
        entry.targetReps >= 0,
    )
    .sort(compareEntries);
  const lastEntry = entries[entries.length - 1];
  if (lastEntry === undefined) {
    return null;
  }

  const reps = entries.map((entry) => entry.actualReps);
  const totalReps = reps.reduce((total, value) => total + value, 0);
  const averageReps = totalReps / entries.length;
  const targetReps = lastEntry.targetReps;
  const withBodyweight = entries.find((entry) => entry.bodyweightKg !== null);

  return {
    sessionId: session.id,
    completedAt: session.completedAt ?? 0,
    performanceCount: entries.length,
    totalReps,
    averageReps,
    bestReps: Math.max(...reps),
    targetReps,
    excessRate: targetReps > 0 ? (averageReps - targetReps) / targetReps : 0,
    intraSessionDrop: calculateIntraSessionDrop(reps),
    bodyweightKg: withBodyweight?.bodyweightKg ?? session.bodyweightKg,
    externalLoadKg: average(
      entries.map((entry) =>
        Number.isFinite(entry.externalLoadKg) ? entry.externalLoadKg : 0,
      ),
    ),
  };
}

/**
 * Séances terminées contenant l'exercice, les `windowSize` plus récentes,
 * de la plus ancienne à la plus récente. in_progress et cancelled sont exclues.
 */
export function selectAnalysisSessions(
  sessions: readonly WorkoutSession[],
  exerciseId: ExerciseId,
  windowSize: number,
): SessionExerciseSummary[] {
  const summaries: SessionExerciseSummary[] = [];
  for (const session of getCompletedSessions(sessions)) {
    const summary = summarizeSessionExercise(session, exerciseId);
    if (summary !== null) {
      summaries.push(summary);
    }
    if (summaries.length >= windowSize) {
      break;
    }
  }
  return summaries.reverse();
}

export function buildMetrics(
  summaries: readonly SessionExerciseSummary[],
  supportsBodyweight: boolean,
  thresholds: ProgressionThresholds,
): ProgressionMetrics {
  const count = summaries.length;
  const averages = summaries.map((summary) => summary.averageReps);

  const bodyweights = summaries
    .map((summary) => summary.bodyweightKg)
    .filter(
      (value): value is number =>
        value !== null && Number.isFinite(value) && value > 0,
    );
  const bodyweightShiftRatio =
    supportsBodyweight && bodyweights.length >= 2
      ? (Math.max(...bodyweights) - Math.min(...bodyweights)) /
        Math.min(...bodyweights)
      : 0;

  const loads = summaries.map((summary) => summary.externalLoadKg);
  const loadVaries =
    count >= 2 &&
    Math.max(...loads) - Math.min(...loads) > thresholds.loadChangeThresholdKg;

  const comparable =
    bodyweightShiftRatio <= thresholds.bodyweightShiftThreshold && !loadVaries;

  const recent = summaries.slice(-thresholds.recentSessionCount);
  const trend = calculatePerformanceTrend(
    averages,
    thresholds.dropRecentSessionCount,
    thresholds.baselineSessionCount,
  );
  const last = summaries[count - 1];

  return {
    sessionCount: count,
    averageReps: roundTo(average(averages)),
    bestReps:
      count === 0
        ? 0
        : Math.max(...summaries.map((summary) => summary.bestReps)),
    recentAverageReps: trend === null ? null : roundTo(trend.recentAverage),
    baselineAverageReps: trend === null ? null : roundTo(trend.baselineAverage),
    trendRatio: trend === null ? null : roundTo(trend.ratio),
    averageExcessRate: roundTo(
      average(recent.map((summary) => summary.excessRate)),
    ),
    intraSessionDrop: roundTo(
      average(recent.map((summary) => Math.max(0, summary.intraSessionDrop))),
    ),
    consistencyCv: roundTo(calculateConsistencyCv(averages)),
    bodyweightKg: last?.bodyweightKg ?? null,
    bodyweightShiftRatio: roundTo(bodyweightShiftRatio),
    externalLoadKg: roundTo(last?.externalLoadKg ?? 0),
    loadVaries,
    comparable,
  };
}
