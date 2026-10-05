import type { Exercise, ExerciseId } from "./types";

export const EXERCISE_IDS = {
  pullUpPronation: "pull_up_pronation",
  dips: "dips",
  pushUp: "push_up",
  lateralRaise: "lateral_raise",
  squat: "squat",
  chinUp: "chin_up",
  romanianDeadlift: "romanian_deadlift",
  abWheel: "ab_wheel",
} as const;

export type CatalogExerciseId =
  (typeof EXERCISE_IDS)[keyof typeof EXERCISE_IDS];

export const SEED_EXERCISES: readonly Exercise[] = [
  {
    id: EXERCISE_IDS.pullUpPronation,
    name: "Pull-ups (pronation)",
    category: "pull",
    movementPattern: "vertical_pull",
    equipment: "bodyweight",
    defaultRepUnit: "reps",
    supportsBodyweight: true,
    supportsExternalLoad: true,
    isActive: true,
  },
  {
    id: EXERCISE_IDS.dips,
    name: "Dips",
    category: "push",
    movementPattern: "vertical_push",
    equipment: "bodyweight",
    defaultRepUnit: "reps",
    supportsBodyweight: true,
    supportsExternalLoad: true,
    isActive: true,
  },
  {
    id: EXERCISE_IDS.pushUp,
    name: "Push-ups",
    category: "push",
    movementPattern: "horizontal_push",
    equipment: "bodyweight",
    defaultRepUnit: "reps",
    supportsBodyweight: true,
    supportsExternalLoad: true,
    isActive: true,
  },
  {
    id: EXERCISE_IDS.lateralRaise,
    name: "Lateral raises",
    category: "isolation",
    movementPattern: "shoulder_abduction",
    equipment: "dumbbell",
    defaultRepUnit: "reps",
    supportsBodyweight: false,
    supportsExternalLoad: true,
    isActive: true,
  },
  {
    id: EXERCISE_IDS.squat,
    name: "Squats",
    category: "legs",
    movementPattern: "squat",
    equipment: "bodyweight",
    defaultRepUnit: "reps",
    supportsBodyweight: true,
    supportsExternalLoad: true,
    isActive: true,
  },
  {
    id: EXERCISE_IDS.chinUp,
    name: "Chin-ups",
    category: "pull",
    movementPattern: "vertical_pull",
    equipment: "bodyweight",
    defaultRepUnit: "reps",
    supportsBodyweight: true,
    supportsExternalLoad: true,
    isActive: true,
  },
  {
    id: EXERCISE_IDS.romanianDeadlift,
    name: "Romanian deadlift (RDL)",
    category: "posterior_chain",
    movementPattern: "hinge",
    equipment: "dumbbell",
    defaultRepUnit: "reps",
    supportsBodyweight: false,
    supportsExternalLoad: true,
    isActive: true,
  },
  {
    id: EXERCISE_IDS.abWheel,
    name: "Ab wheel",
    category: "core",
    movementPattern: "core_flexion",
    equipment: "other",
    defaultRepUnit: "reps",
    supportsBodyweight: true,
    supportsExternalLoad: false,
    isActive: true,
  },
];

export const getSeedExercise = (id: ExerciseId): Exercise | undefined =>
  SEED_EXERCISES.find((exercise) => exercise.id === id);
