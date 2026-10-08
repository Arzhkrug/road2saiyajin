import type { Exercise, ExerciseId } from "../exercises/types";
import { getCompletedSessions } from "../workouts/history";
import type {
  EpochMs,
  WorkoutSession,
  WorkoutTemplate,
} from "../workouts/types";
import {
  analyzeExerciseProgression,
  type AnalyzeExerciseInput,
  type ExerciseAnalysis,
} from "./analyzer";
import type { ProgressionThresholds } from "./thresholds";
import type { ReasonCode, Recommendation } from "./types";

const REASON_TEXTS: Record<ReasonCode, string> = {
  no_data: "Pas encore assez de données pour cet exercice.",
  single_session:
    "Une seule séance terminée : il en faut au moins 3 pour une recommandation fiable.",
  two_sessions_cautious:
    "Seulement 2 séances : pas assez de recul pour modifier la cible.",
  two_sessions_clear_progress:
    "Deux séances nettement au-dessus de la cible : une hausse prudente est possible, à confirmer à la prochaine séance.",
  not_comparable:
    "Le poids du corps ou la charge a changé : la comparaison entre séances est incertaine, on garde la cible.",
  steady_progress: "Tes dernières séances montrent une progression régulière.",
  on_target: "Tu es sur ta cible : on la garde.",
  insufficient_progress:
    "Tu dépasses un peu ta cible, mais pas assez régulièrement pour la relever.",
  isolated_dip:
    "La dernière séance est en retrait, mais ce n'est pas répété : on garde la cible.",
  fatigue_within_session:
    "Tes reps chutent nettement en fin de séance : on consolide avant de monter.",
  repeated_drop:
    "Tes dernières séances sont nettement sous les précédentes. Une cible un peu plus basse peut aider.",
};

export const describeReason = (code: ReasonCode): string => REASON_TEXTS[code];

export interface BuildRecommendationInput extends AnalyzeExerciseInput {
  readonly now: EpochMs;
}

function toRecommendation(
  analysis: ExerciseAnalysis,
  now: EpochMs,
): Recommendation {
  return {
    exerciseId: analysis.exerciseId,
    action: analysis.action,
    currentTarget: analysis.currentTarget,
    suggestedTarget: analysis.suggestedTarget,
    confidence: analysis.confidence,
    reasonCode: analysis.reasonCode,
    reason: describeReason(analysis.reasonCode),
    metrics: analysis.metrics,
    supportingSessionIds: analysis.supportingSessionIds,
    generatedAt: now,
  };
}

export function buildRecommendation(
  input: BuildRecommendationInput,
): Recommendation {
  return toRecommendation(analyzeExerciseProgression(input), input.now);
}

export interface BuildRecommendationsInput {
  readonly sessions: readonly WorkoutSession[];
  readonly templates: readonly WorkoutTemplate[];
  readonly exercises: readonly Exercise[];
  readonly now: EpochMs;
  readonly thresholds?: ProgressionThresholds;
}

/** Une recommandation par exercice (templates + historique), triées par exerciseId. */
export function buildRecommendations(
  input: BuildRecommendationsInput,
): Recommendation[] {
  const ids = new Set<ExerciseId>();
  for (const template of input.templates) {
    for (const block of template.blocks) {
      if (block.type === "emom") {
        block.config.rotation.forEach((movement) =>
          ids.add(movement.exerciseId),
        );
      } else {
        ids.add(block.exerciseId);
      }
    }
  }
  for (const session of getCompletedSessions(input.sessions)) {
    session.performances.forEach((entry) => ids.add(entry.exerciseId));
  }

  const exerciseById = new Map(
    input.exercises.map((exercise) => [exercise.id, exercise] as const),
  );

  return [...ids]
    .sort((a, b) => a.localeCompare(b))
    .map((exerciseId) =>
      buildRecommendation({
        sessions: input.sessions,
        exerciseId,
        exercise: exerciseById.get(exerciseId),
        templates: input.templates,
        thresholds: input.thresholds,
        now: input.now,
      }),
    );
}
