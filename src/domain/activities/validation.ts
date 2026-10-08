import {
  isNonEmptyString,
  isOneOf,
  isPositiveInteger,
  isTimestamp,
  toValidationResult,
  type ValidationResult,
} from "../validation";
import {
  ACTIVITY_INTENSITIES,
  ACTIVITY_TYPES,
  MAX_ACTIVITY_DURATION_MINUTES,
  MAX_ACTIVITY_NOTES_LENGTH,
  type Activity,
} from "./types";

export class ActivityValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid activity: ${errors.join("; ")}`);
    this.name = "ActivityValidationError";
    this.errors = errors;
  }
}

export function validateActivity(activity: Activity): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(activity.id)) {
    errors.push("Activity id is required");
  }
  if (!isOneOf(ACTIVITY_TYPES, activity.type)) {
    errors.push(`Unknown activity type: ${String(activity.type)}`);
  }
  if (!isTimestamp(activity.startedAt)) {
    errors.push("startedAt must be a valid timestamp");
  }
  if (!isTimestamp(activity.createdAt)) {
    errors.push("createdAt must be a valid timestamp");
  }
  if (
    !isPositiveInteger(activity.durationMinutes) ||
    activity.durationMinutes > MAX_ACTIVITY_DURATION_MINUTES
  ) {
    errors.push(
      `durationMinutes must be an integer between 1 and ${MAX_ACTIVITY_DURATION_MINUTES}`,
    );
  }
  if (
    activity.intensity !== null &&
    !isOneOf(ACTIVITY_INTENSITIES, activity.intensity)
  ) {
    errors.push(`Unknown intensity: ${String(activity.intensity)}`);
  }
  if (activity.notes !== null) {
    if (typeof activity.notes !== "string") {
      errors.push("notes must be null or a string");
    } else if (activity.notes.length > MAX_ACTIVITY_NOTES_LENGTH) {
      errors.push(
        `notes must be at most ${MAX_ACTIVITY_NOTES_LENGTH} characters`,
      );
    }
  }

  return toValidationResult(errors);
}

/** Saisie de durée : entier de 1 à 600, sinon null. */
export function parseDurationInput(text: string): number | null {
  const normalized = text.trim();
  if (!/^\d{1,3}$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  return value >= 1 && value <= MAX_ACTIVITY_DURATION_MINUTES ? value : null;
}
