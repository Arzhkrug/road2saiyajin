import { EXERCISE_IDS, type ExerciseId } from "../exercises";
import type {
  StraightSetsBlock,
  WorkoutTemplate,
  WorkoutTemplateId,
} from "./types";

const DEFAULT_SETS = 3;
const DEFAULT_REST_SECONDS = 60;
const EMOM_TOTAL_MINUTES = 20;
const EMOM_INTERVAL_SECONDS = 60;

const straightSets = (
  id: string,
  order: number,
  exerciseId: ExerciseId,
  targetReps: number,
): StraightSetsBlock => ({
  type: "straight_sets",
  id,
  order,
  exerciseId,
  config: {
    sets: DEFAULT_SETS,
    targetReps,
    restSeconds: DEFAULT_REST_SECONDS,
    targetExternalLoadKg: null,
  },
});

export const SESSION_A_TEMPLATE: WorkoutTemplate = {
  id: "session_a",
  name: "Session A",
  code: "A",
  blocks: [
    {
      type: "emom",
      id: "session_a_emom",
      order: 1,
      config: {
        totalMinutes: EMOM_TOTAL_MINUTES,
        intervalSeconds: EMOM_INTERVAL_SECONDS,
        rotation: [
          { exerciseId: EXERCISE_IDS.pullUpPronation, targetReps: 6 },
          { exerciseId: EXERCISE_IDS.dips, targetReps: 8 },
        ],
      },
    },
    straightSets("session_a_push_up", 2, EXERCISE_IDS.pushUp, 10),
    straightSets("session_a_lateral_raise", 3, EXERCISE_IDS.lateralRaise, 15),
  ],
};

export const SESSION_B_TEMPLATE: WorkoutTemplate = {
  id: "session_b",
  name: "Session B",
  code: "B",
  blocks: [
    {
      type: "emom",
      id: "session_b_emom",
      order: 1,
      config: {
        totalMinutes: EMOM_TOTAL_MINUTES,
        intervalSeconds: EMOM_INTERVAL_SECONDS,
        rotation: [
          { exerciseId: EXERCISE_IDS.squat, targetReps: 25 },
          { exerciseId: EXERCISE_IDS.chinUp, targetReps: 5 },
        ],
      },
    },
    straightSets(
      "session_b_romanian_deadlift",
      2,
      EXERCISE_IDS.romanianDeadlift,
      8,
    ),
    straightSets("session_b_ab_wheel", 3, EXERCISE_IDS.abWheel, 5),
  ],
};

export const SEED_WORKOUT_TEMPLATES: readonly WorkoutTemplate[] = [
  SESSION_A_TEMPLATE,
  SESSION_B_TEMPLATE,
];

export const getSeedTemplate = (
  id: WorkoutTemplateId,
): WorkoutTemplate | undefined =>
  SEED_WORKOUT_TEMPLATES.find((template) => template.id === id);
