import { getCompletedSessions } from "../workouts/history";
import type { EpochMs, WorkoutSession } from "../workouts/types";
import { compareActivitiesRecentFirst } from "./queries";
import type { Activity } from "./types";

export interface WorkoutHistoryItem {
  readonly kind: "session";
  readonly at: EpochMs;
  readonly session: WorkoutSession;
}

export interface ActivityHistoryItem {
  readonly kind: "activity";
  readonly at: EpochMs;
  readonly activity: Activity;
}

export type HistoryItem = WorkoutHistoryItem | ActivityHistoryItem;

const sessionTime = (session: WorkoutSession): EpochMs =>
  session.completedAt ?? session.startedAt ?? session.createdAt;

const compareItems = (a: HistoryItem, b: HistoryItem): number => {
  if (b.at !== a.at) {
    return b.at - a.at;
  }
  if (a.kind !== b.kind) {
    return a.kind === "activity" ? -1 : 1;
  }
  if (a.kind === "activity" && b.kind === "activity") {
    return compareActivitiesRecentFirst(a.activity, b.activity);
  }
  if (a.kind === "session" && b.kind === "session") {
    return a.session.id.localeCompare(b.session.id);
  }
  return 0;
};

/**
 * Vue historique unifiée, du plus récent au plus ancien.
 * Seules les séances terminées sont incluses. Les deux modèles restent distincts.
 */
export function buildHistory(
  sessions: readonly WorkoutSession[],
  activities: readonly Activity[],
): HistoryItem[] {
  const sessionItems: HistoryItem[] = getCompletedSessions(sessions).map(
    (session) => ({ kind: "session", at: sessionTime(session), session }),
  );
  const activityItems: HistoryItem[] = activities.map((activity) => ({
    kind: "activity",
    at: activity.startedAt,
    activity,
  }));
  return [...sessionItems, ...activityItems].sort(compareItems);
}
