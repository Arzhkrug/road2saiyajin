import { createPerformanceId, createWorkoutSessionId } from "./ids";
import type {
  BlockType,
  EpochMs,
  PerformanceEntry,
  WorkoutBlockId,
  WorkoutSession,
  WorkoutTemplateId,
} from "./types";

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

export interface RecordPerformanceInput {
  readonly blockId: WorkoutBlockId;
  readonly blockType: BlockType;
  readonly exerciseId: string;
  readonly order: number;
  readonly targetReps: number;
  readonly actualReps: number;
  readonly externalLoadKg: number;
  readonly now: EpochMs;
}

/** Ajoute (ou remplace, à id identique) une performance. Le poids du corps vient de la session. */
export function recordPerformance(
  session: WorkoutSession,
  input: RecordPerformanceInput,
): WorkoutSession {
  const entry: PerformanceEntry = {
    id: createPerformanceId(session.id, input.blockId, input.order),
    blockId: input.blockId,
    blockType: input.blockType,
    exerciseId: input.exerciseId,
    order: input.order,
    targetReps: input.targetReps,
    actualReps: input.actualReps,
    externalLoadKg: input.externalLoadKg,
    bodyweightKg: session.bodyweightKg,
    recordedAt: Math.max(input.now, session.startedAt ?? session.createdAt),
  };
  const others = session.performances.filter((item) => item.id !== entry.id);
  return { ...session, performances: [...others, entry] };
}

export function completeSession(
  session: WorkoutSession,
  now: EpochMs,
): WorkoutSession {
  if (session.status !== "in_progress") {
    return session;
  }
  const latestRecordedAt = session.performances.reduce(
    (latest, entry) => Math.max(latest, entry.recordedAt),
    session.startedAt ?? session.createdAt,
  );
  return {
    ...session,
    status: "completed",
    completedAt: Math.max(now, latestRecordedAt),
  };
}
