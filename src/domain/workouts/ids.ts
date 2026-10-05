import type {
  EpochMs,
  PerformanceId,
  WorkoutBlockId,
  WorkoutSessionId,
  WorkoutTemplateId,
} from "./types";

export const createWorkoutSessionId = (
  templateId: WorkoutTemplateId,
  createdAt: EpochMs,
): WorkoutSessionId => `${templateId}_${createdAt}`;

export const createPerformanceId = (
  sessionId: WorkoutSessionId,
  blockId: WorkoutBlockId,
  order: number,
): PerformanceId => `${sessionId}__${blockId}__${order}`;
