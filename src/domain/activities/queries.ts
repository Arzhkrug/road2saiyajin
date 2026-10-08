import type { EpochMs } from "../workouts/types";
import { getActivityIdSequence } from "./ids";
import type { Activity } from "./types";

/** startedAt, puis createdAt, puis rang numérique d'id : du plus récent au plus ancien. */
export const compareActivitiesRecentFirst = (
  a: Activity,
  b: Activity,
): number =>
  b.startedAt - a.startedAt ||
  b.createdAt - a.createdAt ||
  getActivityIdSequence(b.id) - getActivityIdSequence(a.id) ||
  a.id.localeCompare(b.id);

export const sortActivitiesRecentFirst = (
  activities: readonly Activity[],
): Activity[] => [...activities].sort(compareActivitiesRecentFirst);

export function getRecentActivities(
  activities: readonly Activity[],
  limit: number,
): Activity[] {
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }
  return sortActivitiesRecentFirst(activities).slice(0, Math.floor(limit));
}

/** Activités dont startedAt est dans [start, end], bornes incluses. */
export function getActivitiesBetween(
  activities: readonly Activity[],
  start: EpochMs,
  end: EpochMs,
): Activity[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return [];
  }
  return sortActivitiesRecentFirst(
    activities.filter(
      (activity) => activity.startedAt >= start && activity.startedAt <= end,
    ),
  );
}
