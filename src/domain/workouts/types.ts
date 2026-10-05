import type { ExerciseId } from "../exercises";

export type EpochMs = number;

export const WORKOUT_CODES = ["A", "B"] as const;
export type WorkoutCode = (typeof WORKOUT_CODES)[number];

export const BLOCK_TYPES = ["emom", "straight_sets"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const SESSION_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type WorkoutTemplateId = string;
export type WorkoutBlockId = string;
export type WorkoutSessionId = string;
export type PerformanceId = string;

/* ---------- Template : ce qui est prévu ---------- */

export interface EmomMovement {
  readonly exerciseId: ExerciseId;
  readonly targetReps: number;
}

export interface EmomConfig {
  readonly totalMinutes: number;
  readonly intervalSeconds: number;
  /** Ordre d'alternance : l'intervalle n utilise rotation[n % rotation.length]. */
  readonly rotation: readonly EmomMovement[];
}

export interface EmomInterval {
  /** 1-based. Avec intervalSeconds = 60, correspond à la minute. */
  readonly intervalNumber: number;
  readonly startsAtSeconds: number;
  readonly exerciseId: ExerciseId;
  readonly targetReps: number;
}

export interface StraightSetsConfig {
  readonly sets: number;
  readonly targetReps: number;
  readonly restSeconds: number;
  readonly targetExternalLoadKg: number | null;
}

export interface EmomBlock {
  readonly type: "emom";
  readonly id: WorkoutBlockId;
  readonly order: number;
  readonly config: EmomConfig;
}

export interface StraightSetsBlock {
  readonly type: "straight_sets";
  readonly id: WorkoutBlockId;
  readonly order: number;
  readonly exerciseId: ExerciseId;
  readonly config: StraightSetsConfig;
}

export type WorkoutBlock = EmomBlock | StraightSetsBlock;

export interface WorkoutTemplate {
  readonly id: WorkoutTemplateId;
  readonly name: string;
  readonly code: WorkoutCode;
  readonly blocks: readonly WorkoutBlock[];
}

/* ---------- Session : ce qui s'est réellement passé ---------- */

export interface PerformanceEntry {
  readonly id: PerformanceId;
  readonly blockId: WorkoutBlockId;
  readonly blockType: BlockType;
  readonly exerciseId: ExerciseId;
  /** 1-based : numéro de série (straight_sets) ou d'intervalle/minute (emom). */
  readonly order: number;
  readonly targetReps: number;
  readonly actualReps: number;
  /** 0 = aucune charge additionnelle. */
  readonly externalLoadKg: number;
  /** Instantané historique, jamais recalculé. */
  readonly bodyweightKg: number | null;
  readonly recordedAt: EpochMs;
}

export interface WorkoutSession {
  readonly id: WorkoutSessionId;
  readonly templateId: WorkoutTemplateId;
  readonly status: SessionStatus;
  readonly createdAt: EpochMs;
  readonly startedAt: EpochMs | null;
  readonly completedAt: EpochMs | null;
  /** Instantané du poids du corps au moment de la séance. */
  readonly bodyweightKg: number | null;
  readonly notes: string | null;
  readonly performances: readonly PerformanceEntry[];
}
