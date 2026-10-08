import type { EpochMs } from "../workouts/types";
import type { ActivityId } from "./types";

const ACTIVITY_ID_PATTERN = /^activity_\d+(?:_(\d+))?$/;

/**
 * `activity_<createdAt>` pour la première activité d'un instant, puis
 * `activity_<createdAt>_2`, `_3`… (dernier rang utilisé + 1). Aucun aléa.
 */
export function createActivityId(
  createdAt: EpochMs,
  takenIds: ReadonlySet<ActivityId> = new Set(),
): ActivityId {
  const base = `activity_${createdAt}`;
  let maxSequence = 0;
  for (const id of takenIds) {
    if (id === base) {
      maxSequence = Math.max(maxSequence, 1);
    } else if (id.startsWith(`${base}_`)) {
      const suffix = Number(id.slice(base.length + 1));
      if (Number.isInteger(suffix)) {
        maxSequence = Math.max(maxSequence, suffix);
      }
    }
  }
  return maxSequence === 0 ? base : `${base}_${maxSequence + 1}`;
}

/** 1 pour `activity_T`, N pour `activity_T_N`, 0 si l'id n'a pas ce format. */
export function getActivityIdSequence(id: ActivityId): number {
  const match = ACTIVITY_ID_PATTERN.exec(id);
  if (match === null) {
    return 0;
  }
  const suffix = match[1];
  return suffix === undefined ? 1 : Number(suffix);
}
