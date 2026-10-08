import type { Activity, ActivityId, NewActivityInput } from "./types";

export function normalizeNotes(
  notes: string | null | undefined,
): string | null {
  if (notes === null || notes === undefined) {
    return null;
  }
  const trimmed = notes.trim();
  return trimmed === "" ? null : trimmed;
}

export function createActivity(
  input: NewActivityInput,
  id: ActivityId,
): Activity {
  return {
    id,
    type: input.type,
    startedAt: input.startedAt,
    durationMinutes: input.durationMinutes,
    intensity: input.intensity ?? null,
    notes: normalizeNotes(input.notes),
    createdAt: input.createdAt,
  };
}
