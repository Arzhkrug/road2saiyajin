import {
  isNonEmptyString,
  isOneOf,
  toValidationResult,
  type ValidationResult,
} from "../validation";
import {
  EQUIPMENT_TYPES,
  EXERCISE_CATEGORIES,
  MOVEMENT_PATTERNS,
  REP_UNITS,
  type Exercise,
} from "./types";

const EXERCISE_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export function validateExercise(exercise: Exercise): ValidationResult {
  const errors: string[] = [];

  if (
    !isNonEmptyString(exercise.id) ||
    !EXERCISE_ID_PATTERN.test(exercise.id)
  ) {
    errors.push("Exercise id must be a non-empty snake_case string");
  }
  if (!isNonEmptyString(exercise.name)) {
    errors.push("Exercise name must be a non-empty string");
  }
  if (!isOneOf(EXERCISE_CATEGORIES, exercise.category)) {
    errors.push(`Unknown exercise category: ${String(exercise.category)}`);
  }
  if (!isOneOf(MOVEMENT_PATTERNS, exercise.movementPattern)) {
    errors.push(
      `Unknown movement pattern: ${String(exercise.movementPattern)}`,
    );
  }
  if (!isOneOf(EQUIPMENT_TYPES, exercise.equipment)) {
    errors.push(`Unknown equipment: ${String(exercise.equipment)}`);
  }
  if (!isOneOf(REP_UNITS, exercise.defaultRepUnit)) {
    errors.push(`Unknown rep unit: ${String(exercise.defaultRepUnit)}`);
  }
  if (
    typeof exercise.supportsBodyweight !== "boolean" ||
    typeof exercise.supportsExternalLoad !== "boolean" ||
    typeof exercise.isActive !== "boolean"
  ) {
    errors.push(
      "supportsBodyweight, supportsExternalLoad and isActive must be booleans",
    );
  } else if (!exercise.supportsBodyweight && !exercise.supportsExternalLoad) {
    errors.push("Exercise must support bodyweight or external load (or both)");
  }

  return toValidationResult(errors);
}
