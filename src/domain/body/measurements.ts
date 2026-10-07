import { filterByPeriod } from "../stats/period";
import {
  isNonEmptyString,
  isPositiveNumber,
  isTimestamp,
  toValidationResult,
  type ValidationResult,
} from "../validation";
import type { EpochMs } from "../workouts/types";
import type { WeightMeasurement, WeightMeasurementId } from "./types";

export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 500;

export class WeightValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid weight measurement: ${errors.join("; ")}`);
    this.name = "WeightValidationError";
    this.errors = errors;
  }
}

const roundToTenth = (value: number): number => Math.round(value * 10) / 10;

/**
 * Id déterministe : `weight_<timestamp>` pour la première mesure d'un instant,
 * puis `weight_<timestamp>_2`, `_3`… (dernier numéro utilisé + 1, donc
 * toujours croissant, même après une suppression). Aucun aléa.
 */
export function createMeasurementId(
  recordedAt: EpochMs,
  takenIds: ReadonlySet<WeightMeasurementId> = new Set(),
): WeightMeasurementId {
  const base = `weight_${recordedAt}`;
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

export const createWeightMeasurement = (
  recordedAt: EpochMs,
  weightKg: number,
  id: WeightMeasurementId = createMeasurementId(recordedAt),
): WeightMeasurement => ({
  id,
  recordedAt,
  weightKg,
});

export function validateWeightMeasurement(
  measurement: WeightMeasurement,
): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(measurement.id)) {
    errors.push("Measurement id is required");
  }
  if (!isTimestamp(measurement.recordedAt)) {
    errors.push("recordedAt must be a valid timestamp");
  }
  if (
    !isPositiveNumber(measurement.weightKg) ||
    measurement.weightKg < MIN_WEIGHT_KG ||
    measurement.weightKg > MAX_WEIGHT_KG
  ) {
    errors.push(
      `weightKg must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG}`,
    );
  }

  return toValidationResult(errors);
}

/** Accepte « 74,2 », « 74.2 » ou « 74 » (une décimale max). Renvoie null si invalide. */
export function parseWeightInput(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d)?$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  return value >= MIN_WEIGHT_KG && value <= MAX_WEIGHT_KG ? value : null;
}

const MEASUREMENT_ID_PATTERN = /^weight_\d+(?:_(\d+))?$/;

/** Rang de l'id à timestamp identique : 1 pour `weight_T`, N pour `weight_T_N`. */
const getIdSequence = (id: WeightMeasurementId): number => {
  const match = MEASUREMENT_ID_PATTERN.exec(id);
  if (match === null) {
    return 0;
  }
  const suffix = match[1];
  return suffix === undefined ? 1 : Number(suffix);
};

/** Timestamp, puis rang numérique (donc _2 avant _10), puis id en dernier recours. */
const compareMeasurements = (
  a: WeightMeasurement,
  b: WeightMeasurement,
): number =>
  a.recordedAt - b.recordedAt ||
  getIdSequence(a.id) - getIdSequence(b.id) ||
  a.id.localeCompare(b.id);

/** Ordre chronologique croissant. */
export const sortMeasurements = (
  measurements: readonly WeightMeasurement[],
): WeightMeasurement[] => [...measurements].sort(compareMeasurements);

export function getLatestMeasurement(
  measurements: readonly WeightMeasurement[],
): WeightMeasurement | null {
  const sorted = sortMeasurements(measurements);
  return sorted[sorted.length - 1] ?? null;
}

export function getWeightHistory(
  measurements: readonly WeightMeasurement[],
  days: number,
  now: EpochMs,
): WeightMeasurement[] {
  return sortMeasurements(
    filterByPeriod(
      measurements,
      (measurement) => measurement.recordedAt,
      days,
      now,
    ),
  );
}

export interface WeightSummary {
  readonly firstKg: number;
  readonly lastKg: number;
  readonly minKg: number;
  readonly maxKg: number;
  readonly deltaKg: number;
}

/** Attend une entrée triée (utiliser getWeightHistory ou sortMeasurements). */
export function getWeightSummary(
  sortedMeasurements: readonly WeightMeasurement[],
): WeightSummary | null {
  const first = sortedMeasurements[0];
  const last = sortedMeasurements[sortedMeasurements.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  const values = sortedMeasurements.map((measurement) => measurement.weightKg);
  return {
    firstKg: first.weightKg,
    lastKg: last.weightKg,
    minKg: Math.min(...values),
    maxKg: Math.max(...values),
    deltaKg: roundToTenth(last.weightKg - first.weightKg),
  };
}

/** Ratios [0.12 ; 1] pour le graphique. Série plate : 0.6. Jamais NaN. */
export function normalizeSeries(values: readonly number[]): number[] {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (!(range > 1e-9)) {
    return values.map(() => 0.6);
  }
  return values.map((value) => 0.12 + (0.88 * (value - min)) / range);
}
