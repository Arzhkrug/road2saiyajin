import type { WorkoutSession } from "./types";

const completionTime = (session: WorkoutSession): number =>
  session.completedAt ?? session.startedAt ?? session.createdAt;

/** Séances terminées uniquement, de la plus récente à la plus ancienne. */
export function getCompletedSessions(
  sessions: readonly WorkoutSession[],
): WorkoutSession[] {
  return sessions
    .filter(
      (session) =>
        session.status === "completed" && session.completedAt !== null,
    )
    .sort(
      (a, b) =>
        completionTime(b) - completionTime(a) || a.id.localeCompare(b.id),
    );
}

/** Durée entre startedAt et completedAt, ou null si non calculable. */
export function getSessionDurationMs(session: WorkoutSession): number | null {
  if (session.startedAt === null || session.completedAt === null) {
    return null;
  }
  const duration = session.completedAt - session.startedAt;
  return duration >= 0 ? duration : null;
}

export const countSessionReps = (session: WorkoutSession): number =>
  session.performances.reduce((total, entry) => total + entry.actualReps, 0);
