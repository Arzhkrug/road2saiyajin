import type { EpochMs } from "../../workouts/types";
import type { BodyCompositionId } from "./types";

const COMPOSITION_ID_PATTERN = /^composition_\d+(?:_(\d+))?$/;

/**
 * `composition_<recordedAt>` pour la première mesure d'un instant, puis
 * `composition_<recordedAt>_2`, `_3`… (dernier rang utilisé + 1). Aucun aléa.
 */
export function createCompositionId(
  recordedAt: EpochMs,
  takenIds: ReadonlySet<BodyCompositionId> = new Set(),
): BodyCompositionId {
  const base = `composition_${recordedAt}`;
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

/** 1 pour `composition_T`, N pour `composition_T_N`, 0 si le format est inconnu. */
export function getCompositionIdSequence(id: BodyCompositionId): number {
  const match = COMPOSITION_ID_PATTERN.exec(id);
  if (match === null) {
    return 0;
  }
  const suffix = match[1];
  return suffix === undefined ? 1 : Number(suffix);
}
