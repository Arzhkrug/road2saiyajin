import { createWorkoutSessionId } from "./ids";
import type { EpochMs, WorkoutSession, WorkoutTemplateId } from "./types";

export interface StartSessionInput {
  readonly templateId: WorkoutTemplateId;
  readonly now: EpochMs;
  readonly bodyweightKg: number | null;
}

export function createInProgressSession(
  input: StartSessionInput,
): WorkoutSession {
  return {
    id: createWorkoutSessionId(input.templateId, input.now),
    templateId: input.templateId,
    status: "in_progress",
    createdAt: input.now,
    startedAt: input.now,
    completedAt: null,
    bodyweightKg: input.bodyweightKg,
    notes: null,
    performances: [],
  };
}
