export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

export const toValidationResult = (
  errors: readonly string[],
): ValidationResult => ({
  isValid: errors.length === 0,
  errors,
});

export const isNonEmptyString = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

export const isNonNegativeNumber = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const isPositiveNumber = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const isNonNegativeInteger = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export const isPositiveInteger = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

export const isTimestamp = (value: unknown): boolean =>
  isNonNegativeInteger(value);

export const isOneOf = <T extends string>(
  values: readonly T[],
  value: unknown,
): value is T => values.some((candidate) => candidate === value);
