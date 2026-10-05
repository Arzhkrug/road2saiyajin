import type { Exercise } from "../exercises";
import {
  isNonEmptyString,
  isNonNegativeInteger,
  isNonNegativeNumber,
  isOneOf,
  isPositiveInteger,
  isPositiveNumber,
  isTimestamp,
  toValidationResult,
  type ValidationResult,
} from "../validation";
import {
  BLOCK_TYPES,
  SESSION_STATUSES,
  WORKOUT_CODES,
  type EmomConfig,
  type EmomMovement,
  type PerformanceEntry,
  type StraightSetsConfig,
  type WorkoutSession,
  type WorkoutTemplate,
} from "./types";

export class WorkoutValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid workout data: ${errors.join("; ")}`);
    this.name = "WorkoutValidationError";
    this.errors = errors;
  }
}

/* ---------- Template ---------- */

const collectEmomConfigErrors = (
  config: EmomConfig,
  where: string,
): string[] => {
  const errors: string[] = [];

  if (!isPositiveNumber(config.totalMinutes)) {
    errors.push(`${where}: totalMinutes must be > 0`);
  }
  if (!isPositiveInteger(config.intervalSeconds)) {
    errors.push(`${where}: intervalSeconds must be a positive integer`);
  }
  if (
    isPositiveNumber(config.totalMinutes) &&
    isPositiveInteger(config.intervalSeconds) &&
    !Number.isInteger((config.totalMinutes * 60) / config.intervalSeconds)
  ) {
    errors.push(
      `${where}: total duration must be a whole number of intervals (count must be > 0)`,
    );
  }
  if (!Array.isArray(config.rotation) || config.rotation.length === 0) {
    errors.push(`${where}: rotation must contain at least one movement`);
  } else {
    config.rotation.forEach((movement, index) => {
      if (!isNonEmptyString(movement.exerciseId)) {
        errors.push(`${where}: rotation[${index}].exerciseId is required`);
      }
      if (!isNonNegativeInteger(movement.targetReps)) {
        errors.push(
          `${where}: rotation[${index}].targetReps must be an integer >= 0`,
        );
      }
    });
  }

  return errors;
};

const collectStraightSetsErrors = (
  config: StraightSetsConfig,
  where: string,
): string[] => {
  const errors: string[] = [];

  if (!isPositiveInteger(config.sets)) {
    errors.push(`${where}: sets must be an integer > 0`);
  }
  if (!isNonNegativeInteger(config.targetReps)) {
    errors.push(`${where}: targetReps must be an integer >= 0`);
  }
  if (!isNonNegativeNumber(config.restSeconds)) {
    errors.push(`${where}: restSeconds must be >= 0`);
  }
  if (
    config.targetExternalLoadKg !== null &&
    !isNonNegativeNumber(config.targetExternalLoadKg)
  ) {
    errors.push(`${where}: targetExternalLoadKg must be null or >= 0`);
  }

  return errors;
};

export function validateWorkoutTemplate(
  template: WorkoutTemplate,
  exercises?: readonly Exercise[],
): ValidationResult {
  const errors: string[] = [];
  const knownExerciseIds =
    exercises === undefined
      ? null
      : new Set(exercises.map((exercise) => exercise.id));

  const checkExerciseRef = (exerciseId: string, where: string): void => {
    if (!isNonEmptyString(exerciseId)) {
      errors.push(`${where}: exerciseId is required`);
    } else if (knownExerciseIds !== null && !knownExerciseIds.has(exerciseId)) {
      errors.push(`${where}: unknown exercise "${exerciseId}"`);
    }
  };

  if (!isNonEmptyString(template.id)) {
    errors.push("Template id is required");
  }
  if (!isNonEmptyString(template.name)) {
    errors.push("Template name is required");
  }
  if (!isOneOf(WORKOUT_CODES, template.code)) {
    errors.push(`Unknown template code: ${String(template.code)}`);
  }
  if (!Array.isArray(template.blocks) || template.blocks.length === 0) {
    errors.push("Template must contain at least one block");
    return toValidationResult(errors);
  }

  const blockIds = new Set<string>();
  const blockOrders = new Set<number>();

  template.blocks.forEach((block, index) => {
    const where = `blocks[${index}]`;

    if (!isNonEmptyString(block.id)) {
      errors.push(`${where}: id is required`);
    } else if (blockIds.has(block.id)) {
      errors.push(`${where}: duplicate block id "${block.id}"`);
    } else {
      blockIds.add(block.id);
    }

    if (!isPositiveInteger(block.order)) {
      errors.push(`${where}: order must be an integer > 0`);
    } else if (blockOrders.has(block.order)) {
      errors.push(`${where}: duplicate block order ${block.order}`);
    } else {
      blockOrders.add(block.order);
    }

    switch (block.type) {
      case "emom":
        errors.push(...collectEmomConfigErrors(block.config, where));
        block.config.rotation.forEach(
          (movement: EmomMovement, movementIndex: number) => {
            checkExerciseRef(
              movement.exerciseId,
              `${where}.rotation[${movementIndex}]`,
            );
          },
        );
        break;
      case "straight_sets":
        checkExerciseRef(block.exerciseId, where);
        errors.push(...collectStraightSetsErrors(block.config, where));
        break;
      default:
        errors.push(`${where}: unknown block type`);
        break;
    }
  });

  return toValidationResult(errors);
}

/* ---------- Performances & sessions ---------- */

const collectPerformanceErrors = (
  entry: PerformanceEntry,
  where: string,
): string[] => {
  const errors: string[] = [];

  if (!isNonEmptyString(entry.id)) {
    errors.push(`${where}: id is required`);
  }
  if (!isNonEmptyString(entry.blockId)) {
    errors.push(`${where}: blockId is required`);
  }
  if (!isOneOf(BLOCK_TYPES, entry.blockType)) {
    errors.push(`${where}: unknown blockType`);
  }
  if (!isNonEmptyString(entry.exerciseId)) {
    errors.push(`${where}: exerciseId is required`);
  }
  if (!isPositiveInteger(entry.order)) {
    errors.push(`${where}: order must be an integer > 0`);
  }
  if (!isNonNegativeInteger(entry.targetReps)) {
    errors.push(`${where}: targetReps must be an integer >= 0`);
  }
  if (!isNonNegativeInteger(entry.actualReps)) {
    errors.push(`${where}: actualReps must be an integer >= 0`);
  }
  if (!isNonNegativeNumber(entry.externalLoadKg)) {
    errors.push(`${where}: externalLoadKg must be >= 0`);
  }
  if (entry.bodyweightKg !== null && !isPositiveNumber(entry.bodyweightKg)) {
    errors.push(`${where}: bodyweightKg must be null or > 0`);
  }
  if (!isTimestamp(entry.recordedAt)) {
    errors.push(`${where}: recordedAt must be a valid timestamp`);
  }

  return errors;
};

export function validatePerformanceEntry(
  entry: PerformanceEntry,
): ValidationResult {
  return toValidationResult(collectPerformanceErrors(entry, "performance"));
}

export function validateWorkoutSession(
  session: WorkoutSession,
): ValidationResult {
  const errors: string[] = [];
  const { startedAt, completedAt } = session;

  if (!isNonEmptyString(session.id)) {
    errors.push("Session id is required");
  }
  if (!isNonEmptyString(session.templateId)) {
    errors.push("Session templateId is required");
  }
  if (!isOneOf(SESSION_STATUSES, session.status)) {
    errors.push(`Unknown session status: ${String(session.status)}`);
  }
  if (!isTimestamp(session.createdAt)) {
    errors.push("createdAt must be a valid timestamp");
  }
  if (startedAt !== null && !isTimestamp(startedAt)) {
    errors.push("startedAt must be null or a valid timestamp");
  }
  if (completedAt !== null && !isTimestamp(completedAt)) {
    errors.push("completedAt must be null or a valid timestamp");
  }
  if (
    startedAt !== null &&
    isTimestamp(startedAt) &&
    isTimestamp(session.createdAt) &&
    startedAt < session.createdAt
  ) {
    errors.push("startedAt cannot be before createdAt");
  }
  if (
    session.bodyweightKg !== null &&
    !isPositiveNumber(session.bodyweightKg)
  ) {
    errors.push("bodyweightKg must be null or > 0");
  }
  if (session.notes !== null && typeof session.notes !== "string") {
    errors.push("notes must be null or a string");
  }

  const performances = Array.isArray(session.performances)
    ? session.performances
    : [];
  if (!Array.isArray(session.performances)) {
    errors.push("performances must be an array");
  }

  switch (session.status) {
    case "planned":
      if (startedAt !== null) {
        errors.push("A planned session cannot have startedAt");
      }
      if (completedAt !== null) {
        errors.push("A planned session cannot have completedAt");
      }
      if (performances.length > 0) {
        errors.push("A planned session cannot have performances");
      }
      break;
    case "in_progress":
      if (startedAt === null) {
        errors.push("An in_progress session requires startedAt");
      }
      if (completedAt !== null) {
        errors.push("An in_progress session cannot have completedAt");
      }
      break;
    case "completed":
      if (startedAt === null || completedAt === null) {
        errors.push("A completed session requires startedAt and completedAt");
      } else if (completedAt < startedAt) {
        errors.push("completedAt cannot be before startedAt");
      }
      break;
    case "cancelled":
      if (completedAt !== null) {
        errors.push("A cancelled session cannot have completedAt");
      }
      break;
    default:
      break;
  }

  const performanceIds = new Set<string>();
  performances.forEach((entry, index) => {
    const where = `performances[${index}]`;
    errors.push(...collectPerformanceErrors(entry, where));

    if (isNonEmptyString(entry.id)) {
      if (performanceIds.has(entry.id)) {
        errors.push(`${where}: duplicate performance id "${entry.id}"`);
      } else {
        performanceIds.add(entry.id);
      }
    }
    if (
      isTimestamp(entry.recordedAt) &&
      startedAt !== null &&
      entry.recordedAt < startedAt
    ) {
      errors.push(`${where}: recordedAt is before session startedAt`);
    }
    if (
      isTimestamp(entry.recordedAt) &&
      completedAt !== null &&
      entry.recordedAt > completedAt
    ) {
      errors.push(`${where}: recordedAt is after session completedAt`);
    }
  });

  return toValidationResult(errors);
}
