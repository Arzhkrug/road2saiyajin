import {
  getEmomIntervalCount,
  getOrderedBlocks,
  type EmomBlock,
  type EmomConfig,
  type Exercise,
  type ExerciseId,
  type SessionStatus,
  type WorkoutCode,
  type WorkoutTemplate,
} from "../domain";

export type ExerciseNames = ReadonlyMap<ExerciseId, string>;

export const WORKOUT_FOCUS_LABELS: Record<WorkoutCode, string> = {
  A: "PULL + PUSH",
  B: "LEGS + PULL + POSTERIOR",
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  planned: "PLANIFIÉE",
  in_progress: "EN COURS",
  completed: "TERMINÉE",
  cancelled: "ANNULÉE",
};

export const buildExerciseNames = (
  exercises: readonly Exercise[],
): ExerciseNames =>
  new Map(exercises.map((exercise) => [exercise.id, exercise.name] as const));

export const getExerciseName = (names: ExerciseNames, id: ExerciseId): string =>
  names.get(id) ?? id;

export function getEmomRounds(config: EmomConfig): number {
  const length = config.rotation.length;
  if (length === 0) {
    return 0;
  }
  return Math.floor(getEmomIntervalCount(config) / length);
}

export interface TemplateSummary {
  readonly title: string;
  readonly focus: string;
  readonly headline: string;
  readonly movements: string;
  readonly extraLabel: string | null;
}

export function summarizeTemplate(
  template: WorkoutTemplate,
  names: ExerciseNames,
): TemplateSummary {
  const blocks = getOrderedBlocks(template);
  const emom = blocks.find(
    (block): block is EmomBlock => block.type === "emom",
  );
  const extraCount = blocks.length - (emom === undefined ? 0 : 1);

  return {
    title: template.name.toUpperCase(),
    focus: WORKOUT_FOCUS_LABELS[template.code],
    headline:
      emom === undefined
        ? `${blocks.length} BLOCS`
        : `${emom.config.totalMinutes} MIN EMOM`,
    movements:
      emom === undefined
        ? ""
        : emom.config.rotation
            .map((movement) => getExerciseName(names, movement.exerciseId))
            .join(" / "),
    extraLabel:
      extraCount > 0
        ? `+ ${extraCount} ${extraCount > 1 ? "exercices" : "exercice"}`
        : null,
  };
}
