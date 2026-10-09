import {
  isNonEmptyString,
  isTimestamp,
  toValidationResult,
  type ValidationResult,
} from "../../validation";
import { COMPOSITION_BOUNDS } from "./bounds";
import {
  COMPOSITION_INDICATORS,
  type BodyCompositionMeasurement,
  type CompositionIndicator,
} from "./types";

export class CompositionValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid body composition measurement: ${errors.join("; ")}`);
    this.name = "CompositionValidationError";
    this.errors = errors;
  }
}

const hasAtMostOneDecimal = (value: number): boolean =>
  Math.abs(value * 10 - Math.round(value * 10)) < 1e-6;

/** Nombre fini, dans les bornes de validation, avec une décimale maximale. */
export function isValidIndicatorValue(
  indicator: CompositionIndicator,
  value: unknown,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }
  const { min, max } = COMPOSITION_BOUNDS[indicator];
  return value >= min && value <= max && hasAtMostOneDecimal(value);
}

export function validateCompositionMeasurement(
  measurement: BodyCompositionMeasurement,
): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(measurement.id)) {
    errors.push("Measurement id is required");
  }
  if (!isTimestamp(measurement.recordedAt)) {
    errors.push("recordedAt must be a valid timestamp");
  }

  let present = 0;
  for (const indicator of COMPOSITION_INDICATORS) {
    const value = measurement[indicator];
    if (value === null) {
      continue;
    }
    if (isValidIndicatorValue(indicator, value)) {
      present += 1;
    } else {
      const { min, max } = COMPOSITION_BOUNDS[indicator];
      errors.push(
        `${indicator} must be a finite number between ${min} and ${max} with at most one decimal`,
      );
    }
  }
  if (present === 0) {
    errors.push("At least one indicator is required");
  }

  return toValidationResult(errors);
}

export type IndicatorInput =
  | { readonly kind: "empty" }
  | { readonly kind: "value"; readonly value: number }
  | { readonly kind: "invalid" };

/** Saisie « 18,5 », « 18.5 » ou « 18 » ; champ vide = indicateur absent. */
export function parseIndicatorInput(
  indicator: CompositionIndicator,
  text: string,
): IndicatorInput {
  const normalized = text.trim().replace(",", ".");
  if (normalized === "") {
    return { kind: "empty" };
  }
  if (!/^\d{1,3}(\.\d)?$/.test(normalized)) {
    return { kind: "invalid" };
  }
  const value = Number(normalized);
  return isValidIndicatorValue(indicator, value)
    ? { kind: "value", value }
    : { kind: "invalid" };
}
