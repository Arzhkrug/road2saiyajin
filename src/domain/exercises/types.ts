export const EXERCISE_CATEGORIES = [
  "pull",
  "push",
  "legs",
  "posterior_chain",
  "core",
  "isolation",
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const MOVEMENT_PATTERNS = [
  "vertical_pull",
  "vertical_push",
  "horizontal_push",
  "squat",
  "hinge",
  "core_flexion",
  "shoulder_abduction",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const EQUIPMENT_TYPES = [
  "bodyweight",
  "band",
  "dumbbell",
  "weighted_vest",
  "other",
] as const;
export type Equipment = (typeof EQUIPMENT_TYPES)[number];

export const REP_UNITS = ["reps", "seconds"] as const;
export type RepUnit = (typeof REP_UNITS)[number];

export type ExerciseId = string;

export interface Exercise {
  readonly id: ExerciseId;
  readonly name: string;
  readonly category: ExerciseCategory;
  readonly movementPattern: MovementPattern;
  readonly equipment: Equipment;
  readonly defaultRepUnit: RepUnit;
  readonly supportsBodyweight: boolean;
  readonly supportsExternalLoad: boolean;
  readonly isActive: boolean;
}
