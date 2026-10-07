import type { ExerciseId } from "../exercises/types";
import { countSessionReps, getCompletedSessions } from "../workouts/history";
import type {
  EpochMs,
  PerformanceEntry,
  PerformanceId,
  WorkoutCode,
  WorkoutSession,
  WorkoutSessionId,
  WorkoutTemplate,
} from "../workouts/types";

export interface ExerciseBest {
  readonly exerciseId: ExerciseId;
  readonly performanceId: PerformanceId;
  readonly actualReps: number;
  readonly targetReps: number;
  readonly externalLoadKg: number;
  readonly bodyweightKg: number | null;
  readonly sessionId: WorkoutSessionId;
  readonly recordedAt: EpochMs;
}

export interface WorkoutStats {
  readonly completedSessions: number;
  readonly sessionsByCode: Readonly<Record<WorkoutCode, number>>;
  readonly totalReps: number;
  readonly totalPerformances: number;
  /** 0 si aucune performance (jamais NaN). */
  readonly averageRepsPerPerformance: number;
  /** Une entrée par exercice, jamais comparée entre exercices. */
  readonly bestByExercise: readonly ExerciseBest[];
}

const roundToTenth = (value: number): number => Math.round(value * 10) / 10;

const toBest = (
  entry: PerformanceEntry,
  sessionId: WorkoutSessionId,
): ExerciseBest => ({
  exerciseId: entry.exerciseId,
  performanceId: entry.id,
  actualReps: entry.actualReps,
  targetReps: entry.targetReps,
  externalLoadKg: entry.externalLoadKg,
  bodyweightKg: entry.bodyweightKg,
  sessionId,
  recordedAt: entry.recordedAt,
});

/**
 * Meilleure = plus grand nombre de reps (la charge externe est volontairement ignorée).
 * Égalité : la plus récente. Égalité totale : sessionId puis performanceId
 * (ordre lexicographique décroissant) pour un résultat indépendant de l'ordre d'entrée.
 */
const isBetter = (candidate: ExerciseBest, current: ExerciseBest): boolean => {
  if (candidate.actualReps !== current.actualReps) {
    return candidate.actualReps > current.actualReps;
  }
  if (candidate.recordedAt !== current.recordedAt) {
    return candidate.recordedAt > current.recordedAt;
  }
  const bySession = candidate.sessionId.localeCompare(current.sessionId);
  if (bySession !== 0) {
    return bySession > 0;
  }
  return candidate.performanceId.localeCompare(current.performanceId) > 0;
};

export function getWorkoutStats(
  sessions: readonly WorkoutSession[],
  templates: readonly WorkoutTemplate[],
): WorkoutStats {
  const completed = getCompletedSessions(sessions);
  const codeByTemplate = new Map(
    templates.map((template) => [template.id, template.code] as const),
  );
  const counts: Record<WorkoutCode, number> = { A: 0, B: 0 };
  const bests = new Map<ExerciseId, ExerciseBest>();
  let totalReps = 0;
  let totalPerformances = 0;

  for (const session of completed) {
    /* Template inconnu : la séance compte comme terminée, mais ni en A ni en B. */
    const code = codeByTemplate.get(session.templateId);
    if (code !== undefined) {
      counts[code] += 1;
    }
    totalReps += countSessionReps(session);
    totalPerformances += session.performances.length;

    for (const entry of session.performances) {
      const candidate = toBest(entry, session.id);
      const current = bests.get(entry.exerciseId);
      if (current === undefined || isBetter(candidate, current)) {
        bests.set(entry.exerciseId, candidate);
      }
    }
  }

  return {
    completedSessions: completed.length,
    sessionsByCode: counts,
    totalReps,
    totalPerformances,
    averageRepsPerPerformance:
      totalPerformances > 0 ? roundToTenth(totalReps / totalPerformances) : 0,
    bestByExercise: [...bests.values()].sort((a, b) =>
      a.exerciseId.localeCompare(b.exerciseId),
    ),
  };
}
